import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ==================== PII MASKING ====================
const PII_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  { regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: "[PHONE]" },
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: "[EMAIL]" },
  { regex: /\b\d{9,16}\b/g, replacement: "[CARD_NUMBER]" },
  { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN]" },
  { regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: "[IP]" },
];

function maskPII(text: string): string {
  let masked = text;
  for (const { regex, replacement } of PII_PATTERNS) {
    masked = masked.replace(regex, replacement);
  }
  return masked;
}

// ==================== PROMPT INJECTION DEFENSE ====================
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /forget\s+(all\s+)?(your|previous)\s+/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /\<\|im_start\|\>/i,
  /do\s+not\s+follow\s+/i,
  /override\s+(your|the)\s+(instructions?|rules?|guidelines?)/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /jailbreak/i,
  /DAN\s+mode/i,
];

function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

// ==================== RATE LIMITING ====================
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20; // 20 messages per minute per conversation

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, message, conversation_id, end_user, attachments } = await req.json();

    if (!tenant_id || !message) {
      return new Response(JSON.stringify({ error: "tenant_id and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Get tenant config
    const { data: tenantConfig, error: configError } = await supabase
      .from("tenant_configs")
      .select("*")
      .eq("tenant_id", tenant_id)
      .single();

    if (configError || !tenantConfig) {
      return new Response(JSON.stringify({ error: "Tenant config not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limiting
    const rateLimitKey = `${tenant_id}:${conversation_id || "new"}:${end_user?.email || "anon"}`;
    if (!checkRateLimit(rateLimitKey)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prompt injection defense
    if (tenantConfig.prompt_injection_defense) {
      if (detectPromptInjection(message)) {
        await supabase.from("audit_logs").insert({
          tenant_id,
          actor_type: "system",
          action: "prompt_injection_blocked",
          details: { message_preview: message.substring(0, 200) },
        });
        return new Response(JSON.stringify({
          conversation_id: conversation_id || null,
          response: "Xin lỗi, tin nhắn của bạn không thể xử lý. Vui lòng thử lại với nội dung khác.",
          blocked: true,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // PII masking
    let processedMessage = message;
    if (tenantConfig.pii_masking) {
      processedMessage = maskPII(message);
    }

    // 2. Get or create conversation
    let convId = conversation_id;
    if (!convId) {
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .insert({
          tenant_id,
          end_user_name: end_user?.name || null,
          end_user_email: end_user?.email || null,
          end_user_phone: end_user?.phone || null,
          status: "active",
        })
        .select("id")
        .single();

      if (convError) {
        console.error("Error creating conversation:", convError);
        return new Response(JSON.stringify({ error: "Failed to create conversation" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      convId = conv.id;

      // Webhook notification for new conversation
      if (tenantConfig.webhook_url) {
        dispatchWebhook(tenantConfig.webhook_url, {
          event: "conversation.created",
          tenant_id,
          conversation_id: convId,
          end_user,
        }).catch((e) => console.warn("Webhook dispatch failed:", e));
      }
    }

    // 3. Build enriched message with attachment content
    let enrichedMessage = processedMessage || "";
    const imageAttachments: Array<{ type: string; image_url: { url: string } }> = [];
    let hasKbImportedFiles = false;

    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        if (att.type === "image" && att.content) {
          imageAttachments.push({
            type: "image_url",
            image_url: { url: att.content },
          });
        } else if (att.strategy === "kb_imported") {
          hasKbImportedFiles = true;
          if (att.content) enrichedMessage += `\n\n${att.content}`;
        } else if (att.content) {
          enrichedMessage += `\n\n${att.content}`;
        }
      }
    }

    // Save user message
    await supabase.from("messages").insert({
      conversation_id: convId,
      role: "user",
      content: message || "[attachment]",
    });

    // 4. Get conversation history
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(20);

    const chatMessages = (history || []).map((m) => {
      const role = m.role === "bot" ? "assistant" : m.role === "user" ? "user" : "system";
      return { role, content: m.content };
    });

    // Replace last user message with enriched version
    if (chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === "user") {
      if (imageAttachments.length > 0) {
        (chatMessages[chatMessages.length - 1] as any).content = [
          { type: "text", text: enrichedMessage },
          ...imageAttachments,
        ];
      } else {
        chatMessages[chatMessages.length - 1].content = enrichedMessage;
      }
    }

    // 5. RAG: Search knowledge base (vector + text hybrid)
    let ragContext = "";
    let ragSources: string[] = [];
    try {
      const ragResult = await searchKnowledgeBase(supabase, tenant_id, message, tenantConfig);
      ragContext = ragResult.context;
      ragSources = ragResult.sources;
    } catch (ragErr) {
      console.warn("RAG search failed, continuing without:", ragErr);
    }

    // 6. Get tenant's enabled tools
    const { data: enabledTools } = await supabase
      .from("tool_definitions")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("enabled", true);

    // 7. Build system prompt with RAG context
    let systemPrompt = tenantConfig.system_prompt ||
      `You are an AI support assistant. Be helpful, concise, and professional. If you're not confident about an answer (below ${tenantConfig.confidence_threshold || 0.6} confidence), suggest escalating to a human agent. Always cite sources when using knowledge base information.`;

    // Add rich content format instructions
    systemPrompt += `

--- RESPONSE FORMATTING ---
You support special rich content blocks in your responses:

1. **Mermaid diagrams** - Use for flowcharts, sequence diagrams, etc:
\`\`\`mermaid
graph TD
A[Start] --> B[Step 1]
B --> C{Decision}
C -- Yes --> D[Result A]
C -- No --> E[Result B]
\`\`\`

2. **Charts** - Use for data visualization:
\`\`\`chart
{"type":"bar","title":"Sales","data":[{"month":"Jan","value":100},{"month":"Feb","value":200}]}
\`\`\`

3. **Downloadable files** - Use when user asks for files/exports/Excel/CSV:
\`\`\`file:report.csv
col1,col2,col3
data1,data2,data3
\`\`\`
Supported extensions: .csv, .txt, .json, .xml, .html, .md
When user asks for Excel, generate a .csv file instead (compatible with Excel).

Use these formats when appropriate. For diagrams/flowcharts, always prefer mermaid over text descriptions.
--- END FORMATTING ---`;

    if (ragContext) {
      systemPrompt += `\n\n--- KNOWLEDGE BASE CONTEXT ---\nUse the following information to answer the user's question. Cite the source documents when relevant.\n\n${ragContext}\n--- END CONTEXT ---`;
    }

    if (hasKbImportedFiles) {
      systemPrompt += `\n\nNote: The user has uploaded large files that were imported to the knowledge base. Use the context above to answer questions about them.`;
    }

    // 8. Call the tenant's configured LLM
    const providerEndpoint = tenantConfig.provider_endpoint;
    const providerApiKey = tenantConfig.provider_api_key;
    const model = tenantConfig.provider_model;

    if (!providerEndpoint || !providerApiKey || !model) {
      const fallbackResponse = "Xin lỗi, hệ thống AI chưa được cấu hình cho tenant này. Vui lòng liên hệ quản trị viên.";
      await supabase.from("messages").insert({
        conversation_id: convId,
        role: "bot",
        content: fallbackResponse,
      });
      return new Response(JSON.stringify({
        conversation_id: convId,
        response: fallbackResponse,
        confidence: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toolsPayload = enabledTools?.length ? enabledTools.map((t) => ({
      type: "function",
      function: {
        name: t.tool_id,
        description: t.description || t.name,
        parameters: t.input_schema || { type: "object", properties: {} },
      },
    })) : undefined;

    const llmPayload: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...chatMessages,
      ],
      temperature: tenantConfig.temperature || 0.3,
      max_tokens: tenantConfig.max_tokens || 2048,
      stream: false,
    };
    if (toolsPayload) {
      llmPayload.tools = toolsPayload;
    }

    const completionUrl = providerEndpoint.endsWith("/chat/completions")
      ? providerEndpoint
      : `${providerEndpoint.replace(/\/$/, "")}/chat/completions`;

    const llmResponse = await fetch(completionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(llmPayload),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error(`LLM API error [${llmResponse.status}]:`, errorText);

      const errorResponse = "Xin lỗi, đã có lỗi khi kết nối tới AI. Vui lòng thử lại sau.";
      await supabase.from("messages").insert({
        conversation_id: convId,
        role: "bot",
        content: errorResponse,
      });

      await supabase.from("audit_logs").insert({
        tenant_id,
        actor_type: "bot",
        action: "llm_error",
        details: { status: llmResponse.status, error: errorText.substring(0, 500) },
      });

      return new Response(JSON.stringify({
        conversation_id: convId,
        response: errorResponse,
        confidence: 0,
        error: "LLM provider error",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const llmData = await llmResponse.json();
    const choice = llmData.choices?.[0];
    let botContent = choice?.message?.content || "Không có phản hồi từ AI.";
    let toolUsed: string | undefined;
    let toolLatency: number | undefined;

    // Handle tool calls
    if (choice?.message?.tool_calls?.length) {
      const toolCall = choice.message.tool_calls[0];
      toolUsed = toolCall.function.name;
      const toolStart = Date.now();

      const toolDef = enabledTools?.find((t) => t.tool_id === toolUsed);
      if (toolDef) {
        try {
          const toolResponse = await fetch(toolDef.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: toolCall.function.arguments,
          });
          const toolResult = await toolResponse.json();
          toolLatency = Date.now() - toolStart;

          await supabase.from("tool_call_logs").insert({
            conversation_id: convId,
            tenant_id,
            tool_id: toolUsed,
            input: JSON.parse(toolCall.function.arguments || "{}"),
            output: toolResult,
            status: toolResponse.ok ? "success" : "error",
            latency_ms: toolLatency,
          });

          const followUp = await fetch(completionUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${providerApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                ...llmPayload.messages as object[],
                choice.message,
                { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult) },
              ],
              temperature: tenantConfig.temperature || 0.3,
            }),
          });

          if (followUp.ok) {
            const followUpData = await followUp.json();
            botContent = followUpData.choices?.[0]?.message?.content || botContent;
          }
        } catch (toolError) {
          toolLatency = Date.now() - toolStart;
          console.error("Tool call failed:", toolError);

          await supabase.from("tool_call_logs").insert({
            conversation_id: convId,
            tenant_id,
            tool_id: toolUsed,
            input: JSON.parse(toolCall.function.arguments || "{}"),
            status: "error",
            latency_ms: toolLatency,
            error_message: toolError instanceof Error ? toolError.message : "Unknown error",
          });

          botContent = "Xin lỗi, tôi gặp lỗi khi tra cứu thông tin. Để tôi chuyển cho nhân viên hỗ trợ.";
        }
      }
    }

    // 9. Save bot response
    await supabase.from("messages").insert({
      conversation_id: convId,
      role: "bot",
      content: botContent,
      tool_used: toolUsed || null,
      tool_latency_ms: toolLatency || null,
      sources: ragSources.length > 0 ? ragSources : null,
    });

    // 10. Update conversation metadata
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);

    // 11. Audit log
    await supabase.from("audit_logs").insert({
      tenant_id,
      actor_type: "bot",
      action: "chat_response",
      resource_type: "conversation",
      resource_id: convId,
      details: {
        tool_used: toolUsed,
        model,
        rag_sources: ragSources,
        pii_masked: tenantConfig.pii_masking,
      },
    });

    // 12. Webhook for handoff scenarios
    if (tenantConfig.webhook_url && botContent.includes("chuyển cho nhân viên")) {
      dispatchWebhook(tenantConfig.webhook_url, {
        event: "handoff.suggested",
        tenant_id,
        conversation_id: convId,
        reason: "Bot suggested agent handoff",
      }).catch((e) => console.warn("Webhook dispatch failed:", e));
    }

    return new Response(JSON.stringify({
      conversation_id: convId,
      response: botContent,
      tool_used: toolUsed,
      tool_latency_ms: toolLatency,
      sources: ragSources,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Hybrid RAG search: vector similarity + text search fallback
 */
async function searchKnowledgeBase(
  supabase: any,
  tenantId: string,
  query: string,
  tenantConfig: any
): Promise<{ context: string; sources: string[] }> {
  let chunks: any[] = [];
  let sources: string[] = [];

  // Try vector search first if embeddings are available
  if (tenantConfig.provider_endpoint && tenantConfig.provider_api_key) {
    try {
      const queryEmbedding = await generateQueryEmbedding(
        query,
        tenantConfig.provider_endpoint,
        tenantConfig.provider_api_key
      );

      if (queryEmbedding) {
        const { data: vectorResults, error } = await supabase.rpc("match_kb_chunks", {
          _tenant_id: tenantId,
          _query_embedding: `[${queryEmbedding.join(",")}]`,
          _match_threshold: 0.5,
          _match_count: 5,
        });

        if (!error && vectorResults?.length) {
          chunks = vectorResults;
          console.log(`Vector search found ${chunks.length} chunks`);
        }
      }
    } catch (e) {
      console.warn("Vector search failed, falling back to text:", e);
    }
  }

  // Fallback: text-based search
  if (chunks.length === 0) {
    const searchTerms = query
      .replace(/[^\w\sàáạảãăắằặẳẵâấầậẩẫèéẹẻẽêếềệểễìíịỉĩòóọỏõôốồộổỗơớờợởỡùúụủũưứừựửữỳýỵỷỹđ]/gi, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 8);

    if (searchTerms.length === 0) return { context: "", sources: [] };

    const { data: textChunks, error } = await supabase
      .from("kb_chunks")
      .select("content, chunk_index, document_id")
      .eq("tenant_id", tenantId)
      .textSearch("content", searchTerms.join(" | "), { type: "plain" })
      .limit(5);

    if (error) {
      const { data: fallbackChunks } = await supabase
        .from("kb_chunks")
        .select("content, chunk_index, document_id")
        .eq("tenant_id", tenantId)
        .ilike("content", `%${searchTerms[0]}%`)
        .limit(5);
      chunks = fallbackChunks || [];
    } else {
      chunks = textChunks || [];
    }
  }

  if (chunks.length === 0) return { context: "", sources: [] };

  // Get source document names
  const docIds = [...new Set(chunks.map((c: any) => c.document_id))];
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from("kb_documents")
      .select("id, name")
      .in("id", docIds);
    if (docs) {
      sources = docs.map((d: any) => d.name);
    }
  }

  const context = chunks.map((c: any) => {
    const sim = c.similarity ? ` (relevance: ${(c.similarity * 100).toFixed(0)}%)` : "";
    return `${c.content}${sim}`;
  }).join("\n\n---\n\n");

  return { context, sources };
}

/**
 * Generate embedding for a query
 */
async function generateQueryEmbedding(
  query: string,
  endpoint: string,
  apiKey: string
): Promise<number[] | null> {
  try {
    const baseUrl = endpoint.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
    const embeddingUrl = `${baseUrl}/embeddings`;

    const response = await fetch(embeddingUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: query,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data?.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

/**
 * Dispatch webhook notification
 */
async function dispatchWebhook(url: string, payload: any): Promise<void> {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn("Webhook dispatch error:", e);
  }
}
