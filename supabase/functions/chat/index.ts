import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    }

    // 3. Save user message
    await supabase.from("messages").insert({
      conversation_id: convId,
      role: "user",
      content: message,
    });

    // 4. Get conversation history
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(20);

    const chatMessages = (history || []).map((m) => ({
      role: m.role === "bot" ? "assistant" : m.role === "user" ? "user" : "system",
      content: m.content,
    }));

    // 5. RAG: Search knowledge base for relevant context
    let ragContext = "";
    let ragSources: string[] = [];
    try {
      ragContext = await searchKnowledgeBase(supabase, tenant_id, message, tenantConfig);
      if (ragContext) {
        // Extract document names for sources
        const { data: docs } = await supabase
          .from("kb_chunks")
          .select("document_id, kb_documents!inner(name)")
          .eq("tenant_id", tenant_id)
          .textSearch("content", message.split(" ").slice(0, 5).join(" & "), { type: "plain" })
          .limit(3);
        if (docs) {
          ragSources = [...new Set(docs.map((d: any) => d.kb_documents?.name).filter(Boolean))];
        }
      }
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

    if (ragContext) {
      systemPrompt += `\n\n--- KNOWLEDGE BASE CONTEXT ---\nUse the following information to answer the user's question. Cite the source documents when relevant.\n\n${ragContext}\n--- END CONTEXT ---`;
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
      },
    });

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
 * Search the knowledge base using text search (and vector search if embeddings exist)
 */
async function searchKnowledgeBase(
  supabase: any,
  tenantId: string,
  query: string,
  tenantConfig: any
): Promise<string> {
  // Try text-based search first (always works, no embeddings needed)
  const searchTerms = query
    .replace(/[^\w\sàáạảãăắằặẳẵâấầậẩẫèéẹẻẽêếềệểễìíịỉĩòóọỏõôốồộổỗơớờợởỡùúụủũưứừựửữỳýỵỷỹđ]/gi, "")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);

  if (searchTerms.length === 0) return "";

  // Full-text search on kb_chunks content
  const { data: chunks, error } = await supabase
    .from("kb_chunks")
    .select("content, chunk_index, document_id")
    .eq("tenant_id", tenantId)
    .textSearch("content", searchTerms.join(" | "), { type: "plain" })
    .limit(5);

  if (error) {
    console.warn("Text search error:", error);
    // Fallback: simple ILIKE search
    const { data: fallbackChunks } = await supabase
      .from("kb_chunks")
      .select("content, chunk_index, document_id")
      .eq("tenant_id", tenantId)
      .ilike("content", `%${searchTerms[0]}%`)
      .limit(5);

    if (fallbackChunks?.length) {
      return fallbackChunks.map((c: any) => c.content).join("\n\n---\n\n");
    }
    return "";
  }

  if (chunks?.length) {
    return chunks.map((c: any) => c.content).join("\n\n---\n\n");
  }

  return "";
}
