import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Reuse PII + injection logic from chat function
const PII_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  { regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: "[PHONE]" },
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: "[EMAIL]" },
  { regex: /\b\d{9,16}\b/g, replacement: "[CARD_NUMBER]" },
];

function maskPII(text: string): string {
  let masked = text;
  for (const { regex, replacement } of PII_PATTERNS) {
    masked = masked.replace(regex, replacement);
  }
  return masked;
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

    // Get tenant config
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

    let processedMessage = message;
    if (tenantConfig.pii_masking) {
      processedMessage = maskPII(message);
    }

    // Get or create conversation
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
      if (convError) throw convError;
      convId = conv.id;
    }

    // Build enriched message
    let enrichedMessage = processedMessage || "";
    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        if (att.content && att.type !== "image") {
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

    // Get conversation history
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

    // Replace last user message with enriched version
    if (chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === "user") {
      chatMessages[chatMessages.length - 1].content = enrichedMessage;
    }

    // RAG: text search fallback (simplified for streaming)
    let ragContext = "";
    try {
      const searchTerms = message
        .replace(/[^\w\sàáạảãăắằặẳẵâấầậẩẫèéẹẻẽêếềệểễìíịỉĩòóọỏõôốồộổỗơớờợởỡùúụủũưứừựửữỳýỵỷỹđ]/gi, "")
        .split(/\s+/)
        .filter((w: string) => w.length > 2)
        .slice(0, 5);

      if (searchTerms.length > 0) {
        const { data: chunks } = await supabase
          .from("kb_chunks")
          .select("content")
          .eq("tenant_id", tenant_id)
          .ilike("content", `%${searchTerms[0]}%`)
          .limit(3);

        if (chunks?.length) {
          ragContext = chunks.map((c: any) => c.content).join("\n\n---\n\n");
        }
      }
    } catch { /* ignore */ }

    // Build system prompt
    let systemPrompt = tenantConfig.system_prompt ||
      "You are an AI support assistant. Be helpful, concise, and professional.";

    systemPrompt += `

--- RESPONSE FORMATTING ---
You support special rich content blocks:

1. **Mermaid diagrams**:
\`\`\`mermaid
graph TD
A[Start] --> B[Step]
\`\`\`

2. **Charts**:
\`\`\`chart
{"type":"bar","title":"Sales","data":[{"month":"Jan","value":100}]}
\`\`\`

3. **Downloadable files** (CSV for Excel):
\`\`\`file:report.csv
col1,col2
data1,data2
\`\`\`
--- END FORMATTING ---`;

    if (ragContext) {
      systemPrompt += `\n\n--- KNOWLEDGE BASE CONTEXT ---\n${ragContext}\n--- END CONTEXT ---`;
    }

    const providerEndpoint = tenantConfig.provider_endpoint;
    const providerApiKey = tenantConfig.provider_api_key;
    const model = tenantConfig.provider_model;

    if (!providerEndpoint || !providerApiKey || !model) {
      return new Response(JSON.stringify({ error: "AI provider not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const completionUrl = providerEndpoint.endsWith("/chat/completions")
      ? providerEndpoint
      : `${providerEndpoint.replace(/\/$/, "")}/chat/completions`;

    // Call LLM with streaming
    const llmResponse = await fetch(completionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...chatMessages,
        ],
        temperature: tenantConfig.temperature || 0.3,
        max_tokens: tenantConfig.max_tokens || 2048,
        stream: true,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      console.error(`LLM stream error [${llmResponse.status}]:`, errText);
      return new Response(JSON.stringify({ error: "LLM provider error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SSE stream to client
    const encoder = new TextEncoder();
    let fullContent = "";

    const stream = new ReadableStream({
      async start(controller) {
        // Send meta first
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "meta", conversation_id: convId })}\n\n`));

        const reader = llmResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;

              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  fullContent += delta;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`));
                }
              } catch { /* skip */ }
            }
          }
        } catch (err) {
          console.error("Stream read error:", err);
        }

        // Save bot message
        await supabase.from("messages").insert({
          conversation_id: convId,
          role: "bot",
          content: fullContent || "Không có phản hồi.",
        });

        await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);

        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("Chat stream error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
