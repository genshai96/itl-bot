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
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

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

// ==================== FLOW EXECUTION ENGINE ====================
interface FlowNode {
  id: string;
  type: string;
  data: Record<string, any>;
  position: { x: number; y: number };
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
  context: Record<string, any>;  // variables passed between nodes
  step_count: number;
}

interface FlowExecutionResult {
  response: string;
  handoff?: { priority: string; reason: string };
  tool_used?: string;
  tool_latency_ms?: number;
  new_state: FlowState | null;  // null = flow ended
  sources?: string[];
}

/**
 * Load the active published flow for a tenant
 */
async function loadActiveFlow(supabase: any, tenantId: string): Promise<{
  flowId: string;
  versionId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
} | null> {
  // Find active flow definition
  const { data: flows } = await supabase
    .from("flow_definitions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1);

  if (!flows?.length) return null;

  const flowId = flows[0].id;

  // Get latest published version
  const { data: versions } = await supabase
    .from("flow_versions")
    .select("id, config")
    .eq("flow_id", flowId)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1);

  if (!versions?.length) return null;

  const config = versions[0].config as any;
  if (!config?.nodes?.length) return null;

  return {
    flowId,
    versionId: versions[0].id,
    nodes: config.nodes,
    edges: config.edges || [],
  };
}

/**
 * Get outgoing edges from a node, optionally filtered by sourceHandle
 */
function getOutgoingEdges(edges: FlowEdge[], nodeId: string, handle?: string): FlowEdge[] {
  return edges.filter(e => e.source === nodeId && (!handle || e.sourceHandle === handle));
}

/**
 * Find the next node by following an edge
 */
function getNextNode(nodes: FlowNode[], edges: FlowEdge[], currentNodeId: string, handle?: string): FlowNode | null {
  const outEdges = getOutgoingEdges(edges, currentNodeId, handle);
  if (!outEdges.length) return null;
  return nodes.find(n => n.id === outEdges[0].target) || null;
}

/**
 * Execute a flow from the current state, processing the user's message
 * Returns after hitting a node that produces a response (message, botResponse, handoff)
 * or when the flow ends
 */
async function executeFlow(
  supabase: any,
  flow: { flowId: string; versionId: string; nodes: FlowNode[]; edges: FlowEdge[] },
  state: FlowState | null,
  userMessage: string,
  convId: string,
  tenantConfig: any,
  chatMessages: Array<{ role: string; content: string }>,
  enabledTools: any[] | null,
  ragContext: string,
  ragSources: string[],
): Promise<FlowExecutionResult> {
  const { nodes, edges, flowId, versionId } = flow;
  const MAX_STEPS = 15; // prevent infinite loops

  // Initialize state: find trigger node
  let currentState: FlowState = state || {
    flow_id: flowId,
    flow_version_id: versionId,
    current_node_id: "",
    context: {},
    step_count: 0,
  };

  // If no current node, start from trigger
  let currentNode: FlowNode | null = null;
  if (!currentState.current_node_id) {
    // Find matching trigger
    const triggers = nodes.filter(n => n.type === "trigger");
    // Try intent-specific trigger first
    const intentTrigger = triggers.find(t => 
      t.data?.intent && t.data.intent !== "any" && 
      userMessage.toLowerCase().includes(t.data.intent.toLowerCase())
    );
    currentNode = intentTrigger || triggers[0] || null;
    if (!currentNode) {
      return { response: "", new_state: null, sources: ragSources };
    }
    currentState.current_node_id = currentNode.id;
    // Advance past trigger to the next node
    const nextAfterTrigger = getNextNode(nodes, edges, currentNode.id);
    if (nextAfterTrigger) {
      currentNode = nextAfterTrigger;
      currentState.current_node_id = currentNode.id;
    }
  } else {
    // Resume from saved node
    currentNode = nodes.find(n => n.id === currentState.current_node_id) || null;
    if (!currentNode) {
      return { response: "", new_state: null, sources: ragSources };
    }
    // We're at a node that was waiting for user input. Advance to next.
    const next = getNextNode(nodes, edges, currentNode.id);
    if (next) {
      currentNode = next;
      currentState.current_node_id = currentNode.id;
    }
  }

  // Walk the flow graph
  let stepCount = 0;
  while (currentNode && stepCount < MAX_STEPS) {
    stepCount++;
    currentState.step_count++;
    currentState.current_node_id = currentNode.id;

    switch (currentNode.type) {
      case "trigger": {
        // Already handled above, just advance
        const next = getNextNode(nodes, edges, currentNode.id);
        currentNode = next;
        continue;
      }

      case "message": {
        // Static message - send it and advance to next, but WAIT for user reply
        const msg = currentNode.data?.message || "...";
        // Check if there's a next node — if so, save state to continue on next user message
        const next = getNextNode(nodes, edges, currentNode.id);
        const newState: FlowState | null = next ? {
          ...currentState,
          current_node_id: currentNode.id, // stay here, advance on next message
        } : null;
        return { response: msg, new_state: newState, sources: ragSources };
      }

      case "botResponse": {
        // Call LLM with flow context
        const nodePrompt = currentNode.data?.message || "";
        const flowSystemAddition = nodePrompt
          ? `\n\n--- FLOW INSTRUCTION ---\n${nodePrompt}\nUse conversation context and knowledge base to respond.\n--- END FLOW INSTRUCTION ---`
          : "";

        const llmResult = await callLLM(
          tenantConfig,
          chatMessages,
          ragContext,
          ragSources,
          flowSystemAddition,
          enabledTools,
        );

        // Advance
        const next = getNextNode(nodes, edges, currentNode.id);
        const newState: FlowState | null = next ? {
          ...currentState,
          current_node_id: currentNode.id,
          context: { ...currentState.context, last_bot_response: llmResult.content },
        } : null;

        return {
          response: llmResult.content,
          tool_used: llmResult.tool_used,
          tool_latency_ms: llmResult.tool_latency_ms,
          new_state: newState,
          sources: ragSources,
        };
      }

      case "condition": {
        // Use LLM to evaluate condition based on conversation
        const conditionExpr = currentNode.data?.condition || "";
        const evaluation = await evaluateCondition(
          tenantConfig,
          chatMessages,
          conditionExpr,
          currentState.context,
        );

        const handle = evaluation ? "yes" : "no";
        const next = getNextNode(nodes, edges, currentNode.id, handle);
        currentNode = next;
        continue;
      }

      case "tool": {
        // Execute a tool
        const toolId = currentNode.data?.toolId || "";
        const toolDef = enabledTools?.find(t => t.tool_id === toolId);
        
        if (toolDef) {
          const toolStart = Date.now();
          try {
            const toolResponse = await fetch(toolDef.endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: userMessage, context: currentState.context }),
            });
            const toolResult = await toolResponse.json();
            const toolLatency = Date.now() - toolStart;

            await supabase.from("tool_call_logs").insert({
              conversation_id: convId,
              tenant_id: tenantConfig.tenant_id,
              tool_id: toolId,
              input: { message: userMessage },
              output: toolResult,
              status: toolResponse.ok ? "success" : "error",
              latency_ms: toolLatency,
            });

            currentState.context = {
              ...currentState.context,
              tool_result: toolResult,
              last_tool_id: toolId,
              last_tool_latency: toolLatency,
            };
          } catch (err) {
            const toolLatency = Date.now() - toolStart;
            await supabase.from("tool_call_logs").insert({
              conversation_id: convId,
              tenant_id: tenantConfig.tenant_id,
              tool_id: toolId,
              input: { message: userMessage },
              status: "error",
              latency_ms: toolLatency,
              error_message: err instanceof Error ? err.message : "Unknown",
            });
            currentState.context = { ...currentState.context, tool_result: { error: true }, last_tool_id: toolId };
          }
        }

        const next = getNextNode(nodes, edges, currentNode.id);
        currentNode = next;
        continue;
      }

      case "handoff": {
        // Create handoff event
        const priority = currentNode.data?.priority || "normal";
        const reason = currentNode.data?.label || "Flow-triggered handoff";

        await supabase.from("handoff_events").insert({
          tenant_id: tenantConfig.tenant_id,
          conversation_id: convId,
          priority,
          reason,
          status: "pending",
        });

        await supabase.from("conversations").update({ status: "handoff" }).eq("id", convId);

        return {
          response: `Tôi sẽ chuyển bạn cho nhân viên hỗ trợ. Lý do: ${reason}. Vui lòng đợi trong giây lát.`,
          handoff: { priority, reason },
          new_state: null, // flow ends
          sources: ragSources,
        };
      }

      default: {
        // Unknown node type, try to advance
        const next = getNextNode(nodes, edges, currentNode.id);
        currentNode = next;
        continue;
      }
    }
  }

  // Flow ended without a response node — fall through to normal LLM
  return { response: "", new_state: null, sources: ragSources };
}

/**
 * Use LLM to evaluate a condition expression in the context of conversation
 */
async function evaluateCondition(
  tenantConfig: any,
  chatMessages: Array<{ role: string; content: string }>,
  conditionExpr: string,
  flowContext: Record<string, any>,
): Promise<boolean> {
  const providerEndpoint = tenantConfig.provider_endpoint;
  const providerApiKey = tenantConfig.provider_api_key;
  const model = tenantConfig.provider_model;

  if (!providerEndpoint || !providerApiKey || !model) return true; // default yes

  const completionUrl = providerEndpoint.endsWith("/chat/completions")
    ? providerEndpoint
    : `${providerEndpoint.replace(/\/$/, "")}/chat/completions`;

  const evalPrompt = `You are an evaluator. Given the conversation so far and the flow context, evaluate whether the following condition is TRUE or FALSE.

Condition: "${conditionExpr}"

Flow context variables: ${JSON.stringify(flowContext)}

Reply with ONLY "TRUE" or "FALSE", nothing else.`;

  try {
    const response = await fetch(completionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          ...chatMessages.slice(-6), // last 6 messages for context
          { role: "system", content: evalPrompt },
        ],
        temperature: 0,
        max_tokens: 10,
        stream: false,
      }),
    });

    if (!response.ok) return true;
    const data = await response.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim().toUpperCase();
    return answer.includes("TRUE");
  } catch {
    return true;
  }
}

/**
 * Call LLM with optional flow instruction overlay
 */
async function callLLM(
  tenantConfig: any,
  chatMessages: Array<{ role: string; content: any }>,
  ragContext: string,
  ragSources: string[],
  flowSystemAddition: string,
  enabledTools: any[] | null,
  memoryContext?: string,
): Promise<{ content: string; tool_used?: string; tool_latency_ms?: number }> {
  const providerEndpoint = tenantConfig.provider_endpoint;
  const providerApiKey = tenantConfig.provider_api_key;
  const model = tenantConfig.provider_model;

  if (!providerEndpoint || !providerApiKey || !model) {
    return { content: "AI chưa được cấu hình." };
  }

  let systemPrompt = tenantConfig.system_prompt ||
    `You are an AI support assistant. Be helpful, concise, and professional.`;

  systemPrompt += RESPONSE_FORMAT_INSTRUCTIONS;

  if (memoryContext) {
    systemPrompt += `\n\n--- BOT MEMORY (Rules, Corrections, Facts, Personality) ---\n${memoryContext}\n--- END MEMORY ---`;
  }

  if (ragContext) {
    systemPrompt += `\n\n--- KNOWLEDGE BASE CONTEXT ---\n${ragContext}\n--- END CONTEXT ---`;
  }

  systemPrompt += flowSystemAddition;

  const completionUrl = providerEndpoint.endsWith("/chat/completions")
    ? providerEndpoint
    : `${providerEndpoint.replace(/\/$/, "")}/chat/completions`;

  const toolsPayload = enabledTools?.length ? enabledTools.map((t) => ({
    type: "function",
    function: {
      name: t.tool_id,
      description: t.description || t.name,
      parameters: t.input_schema || { type: "object", properties: {} },
    },
  })) : undefined;

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...chatMessages,
    ],
    temperature: tenantConfig.temperature || 0.3,
    max_tokens: tenantConfig.max_tokens || 2048,
    stream: false,
  };
  if (toolsPayload) payload.tools = toolsPayload;

  const llmResponse = await fetch(completionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!llmResponse.ok) {
    console.error(`LLM error [${llmResponse.status}]`);
    return { content: "Xin lỗi, đã có lỗi khi kết nối tới AI." };
  }

  const llmData = await llmResponse.json();
  const choice = llmData.choices?.[0];
  let content = choice?.message?.content || "Không có phản hồi.";
  let toolUsed: string | undefined;
  let toolLatency: number | undefined;

  // Handle tool calls from LLM
  if (choice?.message?.tool_calls?.length) {
    const toolCall = choice.message.tool_calls[0];
    toolUsed = toolCall.function.name;
    const toolStart = Date.now();
    const toolDef = enabledTools?.find(t => t.tool_id === toolUsed);
    if (toolDef) {
      try {
        const toolResponse = await fetch(toolDef.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: toolCall.function.arguments,
        });
        const toolResult = await toolResponse.json();
        toolLatency = Date.now() - toolStart;

        const followUp = await fetch(completionUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${providerApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              ...payload.messages as object[],
              choice.message,
              { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult) },
            ],
            temperature: tenantConfig.temperature || 0.3,
          }),
        });
        if (followUp.ok) {
          const followUpData = await followUp.json();
          content = followUpData.choices?.[0]?.message?.content || content;
        }
      } catch {
        toolLatency = Date.now() - toolStart;
        content = "Xin lỗi, tôi gặp lỗi khi tra cứu thông tin.";
      }
    }
  }

  return { content, tool_used: toolUsed, tool_latency_ms: toolLatency };
}

const RESPONSE_FORMAT_INSTRUCTIONS = `

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
Supported extensions: .csv, .txt, .json, .xml, .html, .md, .xlsx
When user asks for Excel/spreadsheet, generate a .csv file (the system auto-converts to real .xlsx with formatting).

Use these formats when appropriate. For diagrams/flowcharts, always prefer mermaid over text descriptions.
--- END FORMATTING ---`;

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
    // Attach tenant_id to config for flow engine use
    tenantConfig.tenant_id = tenant_id;

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

      if (convError) {
        console.error("Error creating conversation:", convError);
        return new Response(JSON.stringify({ error: "Failed to create conversation" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      convId = conv.id;
      conversationMetadata = conv.metadata || {};

      if (tenantConfig.webhook_url) {
        dispatchWebhook(tenantConfig.webhook_url, {
          event: "conversation.created",
          tenant_id,
          conversation_id: convId,
          end_user,
        }).catch((e) => console.warn("Webhook dispatch failed:", e));
      }
    } else {
      // Load existing conversation metadata for flow state
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("metadata")
        .eq("id", convId)
        .single();
      conversationMetadata = existingConv?.metadata || {};
    }

    // 3. Build enriched message
    let enrichedMessage = processedMessage || "";
    const imageAttachments: Array<{ type: string; image_url: { url: string } }> = [];
    let hasKbImportedFiles = false;

    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        if (att.type === "image" && att.content) {
          imageAttachments.push({ type: "image_url", image_url: { url: att.content } });
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

    // 5. RAG
    let ragContext = "";
    let ragSources: string[] = [];
    try {
      const ragResult = await searchKnowledgeBase(supabase, tenant_id, message, tenantConfig);
      ragContext = ragResult.context;
      ragSources = ragResult.sources;
    } catch (ragErr) {
      console.warn("RAG search failed:", ragErr);
    }

    // 6. Get enabled tools
    const { data: enabledTools } = await supabase
      .from("tool_definitions")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("enabled", true);

    // ==================== FLOW ENGINE ====================
    // Check if tenant has an active published flow
    const activeFlow = await loadActiveFlow(supabase, tenant_id);
    
    if (activeFlow) {
      console.log(`[Flow Engine] Active flow found: ${activeFlow.flowId}`);
      
      // Get flow state from conversation metadata
      const flowState: FlowState | null = conversationMetadata?.flow_state || null;

      const result = await executeFlow(
        supabase,
        activeFlow,
        flowState,
        message,
        convId,
        tenantConfig,
        chatMessages,
        enabledTools,
        ragContext,
        ragSources,
      );

      if (result.response) {
        // Save bot response
        await supabase.from("messages").insert({
          conversation_id: convId,
          role: "bot",
          content: result.response,
          tool_used: result.tool_used || null,
          tool_latency_ms: result.tool_latency_ms || null,
          sources: result.sources?.length ? result.sources : null,
        });

        // Update conversation metadata with new flow state
        const newMetadata = {
          ...conversationMetadata,
          flow_state: result.new_state,
        };
        await supabase.from("conversations").update({
          metadata: newMetadata,
          updated_at: new Date().toISOString(),
        }).eq("id", convId);

        // Audit log
        await supabase.from("audit_logs").insert({
          tenant_id,
          actor_type: "bot",
          action: "flow_chat_response",
          resource_type: "conversation",
          resource_id: convId,
          details: {
            flow_id: activeFlow.flowId,
            current_node: result.new_state?.current_node_id || "ended",
            step_count: result.new_state?.step_count || 0,
            tool_used: result.tool_used,
            handoff: result.handoff,
          },
        });

        if (result.handoff && tenantConfig.webhook_url) {
          dispatchWebhook(tenantConfig.webhook_url, {
            event: "handoff.triggered",
            tenant_id,
            conversation_id: convId,
            priority: result.handoff.priority,
            reason: result.handoff.reason,
          }).catch(() => {});
        }

        return new Response(JSON.stringify({
          conversation_id: convId,
          response: result.response,
          tool_used: result.tool_used,
          tool_latency_ms: result.tool_latency_ms,
          sources: result.sources,
          flow_active: true,
          flow_node: result.new_state?.current_node_id || null,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // If flow returned empty response, fall through to normal LLM
      console.log("[Flow Engine] Flow returned empty response, falling through to normal LLM");
    }

    // ==================== NORMAL LLM (no active flow) ====================
    const llmResult = await callLLM(
      tenantConfig,
      chatMessages,
      ragContext,
      ragSources,
      hasKbImportedFiles
        ? "\n\nNote: The user uploaded files imported to knowledge base. Use context above."
        : "",
      enabledTools,
    );

    // Save bot response
    await supabase.from("messages").insert({
      conversation_id: convId,
      role: "bot",
      content: llmResult.content,
      tool_used: llmResult.tool_used || null,
      tool_latency_ms: llmResult.tool_latency_ms || null,
      sources: ragSources.length > 0 ? ragSources : null,
    });

    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);

    await supabase.from("audit_logs").insert({
      tenant_id,
      actor_type: "bot",
      action: "chat_response",
      resource_type: "conversation",
      resource_id: convId,
      details: {
        tool_used: llmResult.tool_used,
        model: tenantConfig.provider_model,
        rag_sources: ragSources,
      },
    });

    if (tenantConfig.webhook_url && llmResult.content.includes("chuyển cho nhân viên")) {
      dispatchWebhook(tenantConfig.webhook_url, {
        event: "handoff.suggested",
        tenant_id,
        conversation_id: convId,
        reason: "Bot suggested agent handoff",
      }).catch(() => {});
    }

    return new Response(JSON.stringify({
      conversation_id: convId,
      response: llmResult.content,
      tool_used: llmResult.tool_used,
      tool_latency_ms: llmResult.tool_latency_ms,
      sources: ragSources,
      flow_active: false,
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

// ==================== HELPER FUNCTIONS ====================

async function searchKnowledgeBase(
  supabase: any,
  tenantId: string,
  query: string,
  tenantConfig: any
): Promise<{ context: string; sources: string[] }> {
  let chunks: any[] = [];
  let sources: string[] = [];

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
        }
      }
    } catch (e) {
      console.warn("Vector search failed:", e);
    }
  }

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

  const docIds = [...new Set(chunks.map((c: any) => c.document_id))];
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from("kb_documents")
      .select("id, name")
      .in("id", docIds);
    if (docs) sources = docs.map((d: any) => d.name);
  }

  const context = chunks.map((c: any) => {
    const sim = c.similarity ? ` (relevance: ${(c.similarity * 100).toFixed(0)}%)` : "";
    return `${c.content}${sim}`;
  }).join("\n\n---\n\n");

  return { context, sources };
}

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
      body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

async function dispatchWebhook(url: string, payload: any): Promise<void> {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
    });
  } catch (e) {
    console.warn("Webhook dispatch error:", e);
  }
}
