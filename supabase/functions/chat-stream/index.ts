import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

// ==================== FLOW ENGINE (shared logic) ====================
interface FlowNode {
  id: string;
  type: string;
  data: Record<string, any>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

interface FlowState {
  flow_id: string;
  flow_version_id: string;
  current_node_id: string;
  context: Record<string, any>;
  step_count: number;
}

async function loadActiveFlow(supabase: any, tenantId: string) {
  const { data: flows } = await supabase
    .from("flow_definitions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1);
  if (!flows?.length) return null;

  const { data: versions } = await supabase
    .from("flow_versions")
    .select("id, config")
    .eq("flow_id", flows[0].id)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1);
  if (!versions?.length) return null;

  const config = versions[0].config as any;
  if (!config?.nodes?.length) return null;

  return {
    flowId: flows[0].id,
    versionId: versions[0].id,
    nodes: config.nodes as FlowNode[],
    edges: (config.edges || []) as FlowEdge[],
  };
}

function getNextNode(nodes: FlowNode[], edges: FlowEdge[], nodeId: string, handle?: string): FlowNode | null {
  const outEdges = edges.filter(e => e.source === nodeId && (!handle || e.sourceHandle === handle));
  if (!outEdges.length) return null;
  return nodes.find(n => n.id === outEdges[0].target) || null;
}

async function evaluateCondition(
  tenantConfig: any,
  chatMessages: Array<{ role: string; content: string }>,
  conditionExpr: string,
  flowContext: Record<string, any>,
): Promise<boolean> {
  const { provider_endpoint, provider_api_key, provider_model } = tenantConfig;
  if (!provider_endpoint || !provider_api_key || !provider_model) return true;

  const completionUrl = provider_endpoint.endsWith("/chat/completions")
    ? provider_endpoint
    : `${provider_endpoint.replace(/\/$/, "")}/chat/completions`;

  try {
    const response = await fetch(completionUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider_api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider_model,
        messages: [
          ...chatMessages.slice(-6),
          { role: "system", content: `Evaluate if this condition is TRUE or FALSE based on conversation:\n"${conditionExpr}"\nContext: ${JSON.stringify(flowContext)}\nReply ONLY "TRUE" or "FALSE".` },
        ],
        temperature: 0,
        max_tokens: 10,
        stream: false,
      }),
    });
    if (!response.ok) return true;
    const data = await response.json();
    return (data.choices?.[0]?.message?.content || "").toUpperCase().includes("TRUE");
  } catch {
    return true;
  }
}

/**
 * Execute flow and return a static response for non-LLM nodes,
 * or null to signal that streaming LLM should be used with flow instructions
 */
async function executeFlowForStream(
  supabase: any,
  flow: { flowId: string; versionId: string; nodes: FlowNode[]; edges: FlowEdge[] },
  state: FlowState | null,
  userMessage: string,
  convId: string,
  tenantConfig: any,
  chatMessages: Array<{ role: string; content: string }>,
  enabledTools: any[] | null,
): Promise<{
  staticResponse?: string;
  flowInstruction?: string;
  handoff?: { priority: string; reason: string };
  newState: FlowState | null;
} | null> {
  const { nodes, edges, flowId, versionId } = flow;
  const MAX_STEPS = 15;

  let currentState: FlowState = state || {
    flow_id: flowId,
    flow_version_id: versionId,
    current_node_id: "",
    context: {},
    step_count: 0,
  };

  let currentNode: FlowNode | null = null;
  if (!currentState.current_node_id) {
    const triggers = nodes.filter(n => n.type === "trigger");
    const intentTrigger = triggers.find(t =>
      t.data?.intent && t.data.intent !== "any" &&
      userMessage.toLowerCase().includes(t.data.intent.toLowerCase())
    );
    currentNode = intentTrigger || triggers[0] || null;
    if (!currentNode) return null;
    currentState.current_node_id = currentNode.id;
    const next = getNextNode(nodes, edges, currentNode.id);
    if (next) {
      currentNode = next;
      currentState.current_node_id = currentNode.id;
    }
  } else {
    currentNode = nodes.find(n => n.id === currentState.current_node_id) || null;
    if (!currentNode) return null;
    const next = getNextNode(nodes, edges, currentNode.id);
    if (next) {
      currentNode = next;
      currentState.current_node_id = currentNode.id;
    }
  }

  let stepCount = 0;
  while (currentNode && stepCount < MAX_STEPS) {
    stepCount++;
    currentState.step_count++;
    currentState.current_node_id = currentNode.id;

    switch (currentNode.type) {
      case "trigger": {
        currentNode = getNextNode(nodes, edges, currentNode.id);
        continue;
      }
      case "message": {
        const msg = currentNode.data?.message || "...";
        const next = getNextNode(nodes, edges, currentNode.id);
        return {
          staticResponse: msg,
          newState: next ? { ...currentState } : null,
        };
      }
      case "botResponse": {
        const nodePrompt = currentNode.data?.message || "";
        const next = getNextNode(nodes, edges, currentNode.id);
        return {
          flowInstruction: nodePrompt
            ? `\n\n--- FLOW INSTRUCTION ---\n${nodePrompt}\nUse conversation context and knowledge base.\n--- END FLOW INSTRUCTION ---`
            : "",
          newState: next ? { ...currentState } : null,
        };
      }
      case "condition": {
        const evaluation = await evaluateCondition(
          tenantConfig, chatMessages,
          currentNode.data?.condition || "", currentState.context,
        );
        currentNode = getNextNode(nodes, edges, currentNode.id, evaluation ? "yes" : "no");
        continue;
      }
      case "tool": {
        const toolId = currentNode.data?.toolId || "";
        const toolDef = enabledTools?.find(t => t.tool_id === toolId);
        if (toolDef) {
          try {
            const toolResponse = await fetch(toolDef.endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: userMessage, context: currentState.context }),
            });
            const toolResult = await toolResponse.json();
            currentState.context = { ...currentState.context, tool_result: toolResult };
          } catch {
            currentState.context = { ...currentState.context, tool_result: { error: true } };
          }
        }
        currentNode = getNextNode(nodes, edges, currentNode.id);
        continue;
      }
      case "handoff": {
        const priority = currentNode.data?.priority || "normal";
        const reason = currentNode.data?.label || "Flow-triggered handoff";
        await supabase.from("handoff_events").insert({
          tenant_id: tenantConfig.tenant_id || tenantConfig.id,
          conversation_id: convId,
          priority,
          reason,
          status: "pending",
        });
        await supabase.from("conversations").update({ status: "handoff" }).eq("id", convId);
        return {
          staticResponse: `Tôi sẽ chuyển bạn cho nhân viên hỗ trợ. Lý do: ${reason}. Vui lòng đợi trong giây lát.`,
          handoff: { priority, reason },
          newState: null,
        };
      }
      default: {
        currentNode = getNextNode(nodes, edges, currentNode.id);
        continue;
      }
    }
  }

  return null;
}

// ==================== MAIN HANDLER ====================
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
    tenantConfig.tenant_id = tenant_id;

    let processedMessage = message;
    if (tenantConfig.pii_masking) processedMessage = maskPII(message);

    // Get or create conversation
    let convId = conversation_id;
    let conversationMetadata: any = {};
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
        .select("id, metadata")
        .single();
      if (convError) throw convError;
      convId = conv.id;
      conversationMetadata = conv.metadata || {};
    } else {
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("metadata")
        .eq("id", convId)
        .single();
      conversationMetadata = existingConv?.metadata || {};
    }

    // Build enriched message
    let enrichedMessage = processedMessage || "";
    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        if (att.content && att.type !== "image") enrichedMessage += `\n\n${att.content}`;
      }
    }

    // Save user message
    await supabase.from("messages").insert({
      conversation_id: convId,
      role: "user",
      content: message || "[attachment]",
    });

    // Get history
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

    if (chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === "user") {
      chatMessages[chatMessages.length - 1].content = enrichedMessage;
    }

    // RAG (simplified)
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
        if (chunks?.length) ragContext = chunks.map((c: any) => c.content).join("\n\n---\n\n");
      }
    } catch { /* ignore */ }

    // Get enabled tools
    const { data: enabledTools } = await supabase
      .from("tool_definitions")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("enabled", true);

    // ==================== FLOW ENGINE ====================
    const activeFlow = await loadActiveFlow(supabase, tenant_id);
    let flowInstruction = "";

    if (activeFlow) {
      const flowState: FlowState | null = conversationMetadata?.flow_state || null;
      const flowResult = await executeFlowForStream(
        supabase, activeFlow, flowState, message, convId, tenantConfig, chatMessages, enabledTools,
      );

      if (flowResult) {
        // Static response (message node or handoff) — send as SSE without LLM
        if (flowResult.staticResponse) {
          const encoder = new TextEncoder();
          const staticStream = new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "meta", conversation_id: convId, flow_active: true })}\n\n`));
              // Send as single token
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", content: flowResult.staticResponse })}\n\n`));

              // Save bot message
              await supabase.from("messages").insert({
                conversation_id: convId,
                role: "bot",
                content: flowResult.staticResponse,
              });

              // Update flow state
              await supabase.from("conversations").update({
                metadata: { ...conversationMetadata, flow_state: flowResult.newState },
                updated_at: new Date().toISOString(),
              }).eq("id", convId);

              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              controller.close();
            },
          });

          return new Response(staticStream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
          });
        }

        // botResponse node → use LLM with flow instruction
        if (flowResult.flowInstruction) {
          flowInstruction = flowResult.flowInstruction;
        }

        // Save flow state after non-static execution
        await supabase.from("conversations").update({
          metadata: { ...conversationMetadata, flow_state: flowResult.newState },
          updated_at: new Date().toISOString(),
        }).eq("id", convId);
      }
    }

    // ==================== LLM STREAMING ====================
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

    // Append flow instruction if present
    systemPrompt += flowInstruction;

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

    const encoder = new TextEncoder();
    let fullContent = "";

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "meta", conversation_id: convId, flow_active: !!activeFlow })}\n\n`));

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
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (e) {
    console.error("Chat stream error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
