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
    const { tenant_id, message, conversation_id, end_user } = await req.json();

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

    // 5. Get tenant's enabled tools for function calling
    const { data: enabledTools } = await supabase
      .from("tool_definitions")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("enabled", true);

    // 6. Build system prompt
    const systemPrompt = tenantConfig.system_prompt || 
      `You are an AI support assistant. Be helpful, concise, and professional. If you're not confident about an answer (below ${tenantConfig.confidence_threshold || 0.6} confidence), suggest escalating to a human agent. Always cite sources when using knowledge base information.`;

    // 7. Call the tenant's configured LLM provider
    const providerEndpoint = tenantConfig.provider_endpoint;
    const providerApiKey = tenantConfig.provider_api_key;
    const model = tenantConfig.provider_model;

    if (!providerEndpoint || !providerApiKey || !model) {
      // Fallback: return a helpful message
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

    // Build tools for function calling if available
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

      // Log audit
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

      // Find tool definition
      const toolDef = enabledTools?.find((t) => t.tool_id === toolUsed);
      if (toolDef) {
        try {
          // Call internal tool endpoint
          const toolResponse = await fetch(toolDef.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: toolCall.function.arguments,
          });
          const toolResult = await toolResponse.json();
          toolLatency = Date.now() - toolStart;

          // Log tool call
          await supabase.from("tool_call_logs").insert({
            conversation_id: convId,
            tenant_id,
            tool_id: toolUsed,
            input: JSON.parse(toolCall.function.arguments || "{}"),
            output: toolResult,
            status: toolResponse.ok ? "success" : "error",
            latency_ms: toolLatency,
          });

          // Send tool result back to LLM for final response
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

    // 8. Save bot response
    await supabase.from("messages").insert({
      conversation_id: convId,
      role: "bot",
      content: botContent,
      tool_used: toolUsed || null,
      tool_latency_ms: toolLatency || null,
    });

    // 9. Audit log
    await supabase.from("audit_logs").insert({
      tenant_id,
      actor_type: "bot",
      action: "chat_response",
      resource_type: "conversation",
      resource_id: convId,
      details: {
        tool_used: toolUsed,
        model,
      },
    });

    return new Response(JSON.stringify({
      conversation_id: convId,
      response: botContent,
      tool_used: toolUsed,
      tool_latency_ms: toolLatency,
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
