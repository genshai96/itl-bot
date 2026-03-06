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
  memoryContext: string,
  skillsSystemAddition: string,
  skillToolAllowlist: string[],
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
          `${flowSystemAddition}${skillsSystemAddition}`,
          enabledTools,
          memoryContext,
          supabase,
          tenantConfig.tenant_id,
          skillToolAllowlist,
          convId,
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
        
        const skillAllowsTool = !skillToolAllowlist.length || skillToolAllowlist.includes(toolId);
        if (toolDef && skillAllowsTool && await canInvokeTool(supabase, tenantConfig.tenant_id, toolId)) {
          const toolStart = Date.now();
          try {
            const invoke = await invokeToolWithMcpGovernance(
              supabase,
              tenantConfig.tenant_id,
              convId,
              toolDef,
              { message: userMessage, context: currentState.context },
            );

            await supabase.from("tool_call_logs").insert({
              conversation_id: convId,
              tenant_id: tenantConfig.tenant_id,
              tool_id: toolId,
              input: { message: userMessage },
              output: invoke.result,
              status: invoke.ok ? "success" : "error",
              latency_ms: invoke.latencyMs,
              error_message: invoke.ok ? null : `Tool invocation failed with status ${invoke.status}`,
            });

            currentState.context = {
              ...currentState.context,
              tool_result: invoke.result,
              last_tool_id: toolId,
              last_tool_latency: invoke.latencyMs,
              last_tool_route: invoke.route,
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
        // Create handoff event with dynamic config
        const priority = currentNode.data?.priority || "normal";
        const reason = currentNode.data?.label || "Flow-triggered handoff";
        const handoffMessage = currentNode.data?.handoffMessage || 
          `Tôi sẽ chuyển bạn cho nhân viên hỗ trợ. Lý do: ${reason}. Vui lòng đợi trong giây lát.`;
        const assignTeam = currentNode.data?.assignTeam || "any";

        // Check handoff conditions if specified
        const handoffConditions = currentNode.data?.handoffConditions;
        if (handoffConditions) {
          const shouldHandoff = await evaluateCondition(
            tenantConfig,
            chatMessages,
            handoffConditions,
            currentState.context,
          );
          if (!shouldHandoff) {
            // Conditions not met, skip handoff and advance
            const next = getNextNode(nodes, edges, currentNode.id);
            currentNode = next;
            continue;
          }
        }

        // Find assignee based on team/role preference
        let assignedTo: string | null = null;
        if (assignTeam && assignTeam !== "any") {
          const { data: agents } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("tenant_id", tenantConfig.tenant_id)
            .eq("role", assignTeam)
            .limit(1);
          if (agents?.length) {
            assignedTo = agents[0].user_id;
          }
        }

        await supabase.from("handoff_events").insert({
          tenant_id: tenantConfig.tenant_id,
          conversation_id: convId,
          priority,
          reason,
          status: assignedTo ? "assigned" : "pending",
          assigned_to: assignedTo,
        });

        await supabase.from("conversations").update({ 
          status: "handoff",
          assigned_agent_id: assignedTo,
        }).eq("id", convId);

        return {
          response: handoffMessage,
          handoff: { priority, reason },
          new_state: null,
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
  supabaseClient?: any,
  tenantId?: string,
  skillToolAllowlist: string[] = [],
  conversationId?: string,
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

  const runtimeTools = enabledTools?.filter((tool) =>
    !skillToolAllowlist.length || skillToolAllowlist.includes(tool.tool_id)
  ) || [];

  const toolsPayload = runtimeTools.length ? runtimeTools.map((t) => ({
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
    const toolDef = runtimeTools.find(t => t.tool_id === toolUsed);
    if (toolDef && (!supabaseClient || !tenantId || !toolUsed || await canInvokeTool(supabaseClient, tenantId, toolUsed))) {
      try {
        const invoke = supabaseClient && tenantId
          ? await invokeToolWithMcpGovernance(
              supabaseClient,
              tenantId,
              conversationId || "llm-tool-call",
              toolDef,
              toolCall.function.arguments,
            )
          : {
              ok: true,
              status: 200,
              latencyMs: Date.now() - toolStart,
              result: await (await fetch(toolDef.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: toolCall.function.arguments,
              })).json(),
              route: "direct",
            };

        const toolResult = invoke.result;
        toolLatency = invoke.latencyMs;

        if (supabaseClient && tenantId && conversationId) {
          await supabaseClient.from("tool_call_logs").insert({
            conversation_id: conversationId,
            tenant_id: tenantId,
            tool_id: toolUsed,
            input: { source: "llm_tool_call", arguments: toolCall.function.arguments },
            output: toolResult,
            status: invoke.ok ? "success" : "error",
            latency_ms: invoke.latencyMs,
            error_message: invoke.ok ? null : `LLM tool call failed with status ${invoke.status}`,
          });
        }

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
      } catch (err) {
        toolLatency = Date.now() - toolStart;

        if (supabaseClient && tenantId && conversationId) {
          await supabaseClient.from("tool_call_logs").insert({
            conversation_id: conversationId,
            tenant_id: tenantId,
            tool_id: toolUsed,
            input: { source: "llm_tool_call", arguments: toolCall.function.arguments },
            status: "error",
            latency_ms: toolLatency,
            error_message: err instanceof Error ? err.message : "Unknown tool invocation error",
          });
        }

        const errMsg = err instanceof Error ? err.message : "";
        if (errMsg.toLowerCase().includes("circuit open") || errMsg.toLowerCase().includes("mcp")) {
          content = "Xin lỗi, hệ thống công cụ đang quá tải. Tôi sẽ chuyển bạn tới đội hỗ trợ ngay bây giờ.";
        } else {
          content = "Xin lỗi, tôi gặp lỗi khi tra cứu thông tin.";
        }
      }
    } else {
      content = "Xin lỗi, công cụ này hiện không khả dụng theo chính sách tenant.";
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

function buildTraceId(): string {
  return `trace_${crypto.randomUUID()}`;
}

function resolveUserRef(endUser: any, conversationId: string): string {
  return endUser?.email || endUser?.phone || `conv:${conversationId}`;
}

type RuntimeSkill = {
  id: string;
  skill_id: string;
  name: string;
  version: string;
  status: string;
  config: Record<string, any>;
  manifest: Record<string, any>;
};

async function loadTenantRuntimeSkills(supabase: any, tenantId: string): Promise<RuntimeSkill[]> {
  const { data, error } = await supabase
    .from("tenant_skill_bindings")
    .select("id, status, pinned_version, config, skills_registry:skill_registry_id(skill_id, name, version, status, manifest)")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "test"])
    .order("updated_at", { ascending: false });

  if (error || !data?.length) return [];

  const out: RuntimeSkill[] = [];
  for (const row of data as any[]) {
    const registry = row.skills_registry;
    if (!registry) continue;
    const version = row.pinned_version || registry.version;
    if (row.pinned_version && row.pinned_version !== registry.version) continue;

    out.push({
      id: row.id,
      skill_id: registry.skill_id,
      name: registry.name,
      version,
      status: row.status,
      config: row.config || {},
      manifest: registry.manifest || {},
    });
  }

  return out;
}

function resolveSkillsForMessage(
  skills: RuntimeSkill[],
  message: string,
): { matchedSkills: RuntimeSkill[]; skillsSystemAddition: string; skillToolAllowlist: string[] } {
  const lc = message.toLowerCase();
  const matched: RuntimeSkill[] = [];
  const allowTools = new Set<string>();

  for (const skill of skills) {
    const triggers: string[] = [
      ...(Array.isArray(skill.manifest?.triggers) ? skill.manifest.triggers : []),
      ...(Array.isArray(skill.config?.triggers) ? skill.config.triggers : []),
    ].map((x) => String(x).toLowerCase());

    const alwaysOn = skill.config?.always_on === true || skill.manifest?.always_on === true;
    const isMatched = alwaysOn || triggers.some((trigger) => trigger && lc.includes(trigger));
    if (!isMatched) continue;

    matched.push(skill);

    const tools: string[] = [
      ...(Array.isArray(skill.manifest?.allowed_tools) ? skill.manifest.allowed_tools : []),
      ...(Array.isArray(skill.config?.allowed_tools) ? skill.config.allowed_tools : []),
    ];

    for (const tool of tools) {
      if (tool) allowTools.add(String(tool));
    }
  }

  const skillInstructions = matched
    .map((skill) => {
      const instruction = skill.config?.instruction || skill.manifest?.instruction || skill.manifest?.prompt || "";
      return instruction
        ? `- ${skill.name} (${skill.skill_id}@${skill.version}): ${instruction}`
        : `- ${skill.name} (${skill.skill_id}@${skill.version})`;
    })
    .join("\n");

  const skillsSystemAddition = matched.length
    ? `\n\n--- ACTIVE SKILLS ---\n${skillInstructions}\nFollow these skill instructions while remaining policy-safe.\n--- END ACTIVE SKILLS ---`
    : "";

  return {
    matchedSkills: matched,
    skillsSystemAddition,
    skillToolAllowlist: Array.from(allowTools),
  };
}

type MemoryCandidate = {
  memory_type: "profile" | "preference" | "fact" | "episodic" | "procedural" | "constraint";
  memory_key: string | null;
  content: string;
  confidence: number;
  importance: number;
  risk_level: "low" | "medium" | "high";
  metadata: Record<string, any>;
};

function extractMemoryCandidates(userMessage: string): MemoryCandidate[] {
  const msg = userMessage.trim();
  const lc = msg.toLowerCase();
  const out: Array<any> = [];

  const nameMatch = msg.match(/\b(my name is|i am|i'm)\s+([a-zA-ZÀ-ỹ][\wÀ-ỹ' -]{1,80})/i);
  if (nameMatch) {
    out.push({
      memory_type: "profile",
      memory_key: "profile.name",
      content: `User name is ${nameMatch[2].trim()}`,
      confidence: 0.85,
      importance: 5,
      risk_level: "low",
      metadata: { source: "regex:name" },
    });
  }

  const preferenceMarkers = ["i prefer", "please use", "i like", "i don't like", "i do not like"];
  if (preferenceMarkers.some((marker) => lc.includes(marker))) {
    out.push({
      memory_type: "preference",
      memory_key: null,
      content: msg,
      confidence: 0.65,
      importance: 4,
      risk_level: "low",
      metadata: { source: "heuristic:preference" },
    });
  }

  const hasSensitive = /\b(password|otp|credit card|ccv|cvv|token|api key)\b/i.test(msg);
  if (!hasSensitive && msg.length >= 20 && msg.length <= 300) {
    out.push({
      memory_type: "episodic",
      memory_key: null,
      content: msg,
      confidence: 0.58,
      importance: 2,
      risk_level: "low",
      metadata: { source: "heuristic:episodic" },
    });
  }

  return out;
}

function parseJsonArrayFromText(raw: string): any[] | null {
  const trimmed = raw.trim();
  try {
    const direct = JSON.parse(trimmed);
    return Array.isArray(direct) ? direct : null;
  } catch {
    // continue
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      // continue
    }
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try {
      const parsed = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

async function extractMemoryCandidatesAdvanced(
  userMessage: string,
  tenantConfig: any,
): Promise<MemoryCandidate[]> {
  const baseCandidates = extractMemoryCandidates(userMessage);

  const providerEndpoint = tenantConfig.provider_endpoint;
  const providerApiKey = tenantConfig.provider_api_key;
  const model = tenantConfig.provider_model;

  if (!providerEndpoint || !providerApiKey || !model || userMessage.trim().length < 12) {
    return baseCandidates;
  }

  const completionUrl = providerEndpoint.endsWith("/chat/completions")
    ? providerEndpoint
    : `${providerEndpoint.replace(/\/$/, "")}/chat/completions`;

  const prompt = `Extract durable user memory candidates from this single user message.

Message: """${userMessage}"""

Rules:
- Return only a JSON array.
- Each object fields: memory_type, memory_key, content, confidence, importance, risk_level.
- memory_type one of: profile, preference, fact, episodic, procedural, constraint.
- confidence in [0,1], importance in [1,5], risk_level one of low|medium|high.
- Do NOT extract secrets (passwords, OTP, tokens, card data).
- Keep max 4 items.`;

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
          { role: "system", content: "You are a strict JSON extractor." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        max_tokens: 500,
        stream: false,
      }),
    });

    if (!response.ok) {
      return baseCandidates;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = parseJsonArrayFromText(content);

    if (!parsed?.length) {
      return baseCandidates;
    }

    const allowedTypes = new Set(["profile", "preference", "fact", "episodic", "procedural", "constraint"]);
    const allowedRisk = new Set(["low", "medium", "high"]);

    const llmCandidates: MemoryCandidate[] = parsed
      .map((item: any) => {
        const memoryType = String(item.memory_type || "fact").toLowerCase();
        const riskLevel = String(item.risk_level || "low").toLowerCase();
        const confidence = Number(item.confidence ?? 0.6);
        const importance = Number(item.importance ?? 3);
        const contentText = String(item.content || "").trim();
        const memoryKeyRaw = item.memory_key == null ? null : String(item.memory_key).trim();

        if (!allowedTypes.has(memoryType) || !allowedRisk.has(riskLevel) || !contentText) {
          return null;
        }

        return {
          memory_type: memoryType as MemoryCandidate["memory_type"],
          memory_key: memoryKeyRaw || null,
          content: contentText,
          confidence: Math.max(0, Math.min(1, confidence)),
          importance: Math.max(1, Math.min(5, Math.round(importance))),
          risk_level: riskLevel as MemoryCandidate["risk_level"],
          metadata: { source: "llm_extractor" },
        };
      })
      .filter(Boolean) as MemoryCandidate[];

    const merged = [...llmCandidates, ...baseCandidates]
      .reduce<MemoryCandidate[]>((acc, candidate) => {
        const key = `${candidate.memory_type}|${candidate.memory_key || ""}|${candidate.content.toLowerCase()}`;
        if (!acc.some((x) => `${x.memory_type}|${x.memory_key || ""}|${x.content.toLowerCase()}` === key)) {
          acc.push(candidate);
        }
        return acc;
      }, [])
      .slice(0, 6);

    return merged;
  } catch {
    return baseCandidates;
  }
}

async function recallMemoryContextV2(
  supabase: any,
  tenantId: string,
  userRef: string,
  queryText: string,
  conversationId: string,
): Promise<string> {
  const terms = queryText
    .toLowerCase()
    .replace(/[^\w\sàáạảãăắằặẳẵâấầậẩẫèéẹẻẽêếềệểễìíịỉĩòóọỏõôốồộổỗơớờợởỡùúụủũưứừựửữỳýỵỷỹđ]/gi, "")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);

  const { data: items } = await supabase
    .from("memory_items")
    .select("id, memory_type, memory_key, content, confidence, importance, risk_level, updated_at, last_seen_at")
    .eq("tenant_id", tenantId)
    .eq("user_ref", userRef)
    .eq("status", "active")
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(30);

  if (!items?.length) return "";

  const now = Date.now();
  const scored = items.map((item: any) => {
    const contentLc = String(item.content || "").toLowerCase();
    const relevanceHits = terms.length
      ? terms.filter((t) => contentLc.includes(t)).length / terms.length
      : 0;
    const recencyMs = Math.max(0, now - new Date(item.updated_at || item.last_seen_at).getTime());
    const recencyScore = Math.max(0, 1 - recencyMs / (1000 * 60 * 60 * 24 * 90));
    const confidenceScore = Math.max(0, Math.min(1, Number(item.confidence ?? 0.6)));
    const importanceScore = Math.max(0, Math.min(1, Number(item.importance ?? 3) / 5));
    const riskPenalty = item.risk_level === "high" ? 0.15 : item.risk_level === "medium" ? 0.05 : 0;
    const total = relevanceHits * 0.4 + recencyScore * 0.2 + confidenceScore * 0.2 + importanceScore * 0.2 - riskPenalty;
    return { item, total };
  });

  const top = scored
    .sort((a: { item: any; total: number }, b: { item: any; total: number }) => b.total - a.total)
    .slice(0, 8)
    .filter((entry: { item: any; total: number }) => entry.total > 0.12);

  if (!top.length) return "";

  await supabase.from("memory_access_logs").insert(
    top.map(({ item, total }: { item: any; total: number }) => ({
      tenant_id: tenantId,
      conversation_id: conversationId,
      user_ref: userRef,
      memory_item_id: item.id,
      action: "recall",
      score: Math.round(total * 1000) / 1000,
      metadata: { reason: "chat_recall" },
    })),
  );

  const grouped = new Map<string, string[]>();
  for (const { item } of top) {
    const key = String(item.memory_type || "fact").toUpperCase();
    const bucket = grouped.get(key) || [];
    bucket.push(`- ${item.content}`);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.entries())
    .map(([type, rows]) => `[${type}]\n${rows.join("\n")}`)
    .join("\n\n");
}

async function persistMemoryCandidatesV2(
  supabase: any,
  tenantId: string,
  userRef: string,
  conversationId: string,
  sourceMessageId: string | null,
  candidates: MemoryCandidate[],
): Promise<void> {
  if (!candidates.length) return;

  for (const candidate of candidates) {
    let memoryItemId: string | null = null;

    if (candidate.memory_key) {
      const { data: existing } = await supabase
        .from("memory_items")
        .select("id, content, confidence")
        .eq("tenant_id", tenantId)
        .eq("user_ref", userRef)
        .eq("memory_key", candidate.memory_key)
        .eq("status", "active")
        .maybeSingle();

      if (existing?.id) {
        const oldContent = String(existing.content || "").trim().toLowerCase();
        const newContent = String(candidate.content || "").trim().toLowerCase();
        const likelyConflict = oldContent && newContent && oldContent !== newContent &&
          Number(existing.confidence ?? 0.6) >= 0.6 && candidate.confidence >= 0.6;

        if (likelyConflict) {
          const { data: conflictingItem } = await supabase
            .from("memory_items")
            .insert({
              tenant_id: tenantId,
              user_ref: userRef,
              memory_type: candidate.memory_type,
              memory_key: candidate.memory_key,
              content: candidate.content,
              confidence: candidate.confidence,
              importance: candidate.importance,
              risk_level: candidate.risk_level,
              status: "superseded",
              source_conversation_id: conversationId,
              source_message_id: sourceMessageId,
              metadata: { ...candidate.metadata, conflict_candidate: true },
            })
            .select("id")
            .single();

          if (conflictingItem?.id) {
            await supabase.from("memory_conflicts").insert({
              tenant_id: tenantId,
              user_ref: userRef,
              memory_item_id: existing.id,
              conflicting_item_id: conflictingItem.id,
              reason: `Conflicting update for key ${candidate.memory_key}`,
              status: "open",
            });

            await supabase.from("memory_access_logs").insert({
              tenant_id: tenantId,
              conversation_id: conversationId,
              user_ref: userRef,
              memory_item_id: existing.id,
              action: "conflict_detected",
              metadata: { memory_key: candidate.memory_key },
            });
          }

          continue;
        }

        memoryItemId = existing.id;
        await supabase
          .from("memory_items")
          .update({
            content: candidate.content,
            memory_type: candidate.memory_type,
            confidence: candidate.confidence,
            importance: candidate.importance,
            risk_level: candidate.risk_level,
            last_seen_at: new Date().toISOString(),
            source_conversation_id: conversationId,
            source_message_id: sourceMessageId,
            metadata: candidate.metadata,
          })
          .eq("id", existing.id);
      }
    }

    if (!memoryItemId) {
      const { data: inserted } = await supabase
        .from("memory_items")
        .insert({
          tenant_id: tenantId,
          user_ref: userRef,
          memory_type: candidate.memory_type,
          memory_key: candidate.memory_key,
          content: candidate.content,
          confidence: candidate.confidence,
          importance: candidate.importance,
          risk_level: candidate.risk_level,
          source_conversation_id: conversationId,
          source_message_id: sourceMessageId,
          metadata: candidate.metadata,
        })
        .select("id")
        .single();
      memoryItemId = inserted?.id || null;
    }

    if (memoryItemId) {
      await supabase.from("memory_access_logs").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        user_ref: userRef,
        memory_item_id: memoryItemId,
        action: "write",
        metadata: {
          memory_type: candidate.memory_type,
          memory_key: candidate.memory_key,
        },
      });
    }
  }
}

async function applyMemoryDecayV2(supabase: any, tenantId: string, memoryDecayDays: number): Promise<void> {
  const cutoff = new Date(Date.now() - memoryDecayDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleItems } = await supabase
    .from("memory_items")
    .select("id, user_ref")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .lt("last_seen_at", cutoff)
    .is("expires_at", null)
    .limit(100);

  if (staleItems?.length) {
    const staleIds = staleItems.map((item: any) => item.id);
    await supabase
      .from("memory_items")
      .update({ status: "expired" })
      .in("id", staleIds);

    await supabase.from("memory_access_logs").insert(
      staleItems.map((item: any) => ({
        tenant_id: tenantId,
        conversation_id: null,
        user_ref: item.user_ref,
        memory_item_id: item.id,
        action: "expire",
        metadata: { reason: "decay_worker", cutoff },
      })),
    );
  }

  await supabase
    .from("memory_conflicts")
    .update({ status: "ignored", resolution_note: "Auto-ignored by decay worker", resolved_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .lt("created_at", cutoff);
}

async function canInvokeTool(
  supabase: any,
  tenantId: string,
  toolId: string,
): Promise<boolean> {
  const { data: policy } = await supabase
    .from("mcp_tool_policies")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .eq("tool_id", toolId)
    .maybeSingle();

  if (!policy) return true;
  return policy.enabled !== false;
}

async function recordMcpEvent(
  supabase: any,
  tenantId: string,
  tenantMcpBindingId: string | null,
  eventType: "healthcheck_ok" | "healthcheck_fail" | "invoke_ok" | "invoke_fail" | "circuit_opened" | "circuit_reset",
  details: Record<string, any>,
): Promise<void> {
  await supabase.from("mcp_health_events").insert({
    tenant_id: tenantId,
    tenant_mcp_binding_id: tenantMcpBindingId,
    event_type: eventType,
    details,
  });
}

async function getOrCreateMcpRuntimeState(
  supabase: any,
  tenantId: string,
  tenantMcpBindingId: string,
): Promise<any> {
  const { data: existing } = await supabase
    .from("mcp_runtime_state")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("tenant_mcp_binding_id", tenantMcpBindingId)
    .maybeSingle();

  if (existing) return existing;

  const { data: inserted } = await supabase
    .from("mcp_runtime_state")
    .insert({
      tenant_id: tenantId,
      tenant_mcp_binding_id: tenantMcpBindingId,
      failure_count: 0,
      circuit_state: "closed",
    })
    .select("*")
    .single();

  return inserted;
}

async function invokeToolWithMcpGovernance(
  supabase: any,
  tenantId: string,
  conversationId: string,
  toolDef: any,
  payload: any,
): Promise<{ ok: boolean; status: number; latencyMs: number; result: any; route: string }> {
  const start = Date.now();

  const { data: policy } = await supabase
    .from("mcp_tool_policies")
    .select("tenant_mcp_binding_id")
    .eq("tenant_id", tenantId)
    .eq("tool_id", toolDef.tool_id)
    .maybeSingle();

  // No MCP binding policy yet: direct invoke (backward compatible)
  if (!policy?.tenant_mcp_binding_id) {
    const response = await fetch(toolDef.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - start,
      result,
      route: "direct",
    };
  }

  const { data: binding } = await supabase
    .from("tenant_mcp_bindings")
    .select("id, enabled, timeout_ms, retry_max, circuit_breaker_threshold, mcp_server_id")
    .eq("tenant_id", tenantId)
    .eq("id", policy.tenant_mcp_binding_id)
    .maybeSingle();

  if (!binding?.enabled) {
    throw new Error("MCP binding disabled");
  }

  const { data: server } = await supabase
    .from("mcp_servers")
    .select("id, endpoint, healthcheck_path, status")
    .eq("id", binding.mcp_server_id)
    .maybeSingle();

  if (!server || server.status === "disabled") {
    throw new Error("MCP server unavailable");
  }

  const runtimeState = await getOrCreateMcpRuntimeState(supabase, tenantId, binding.id);
  const now = Date.now();
  const circuitOpenUntil = runtimeState?.circuit_open_until ? new Date(runtimeState.circuit_open_until).getTime() : null;

  if (runtimeState?.circuit_state === "open" && circuitOpenUntil && circuitOpenUntil > now) {
    throw new Error("MCP circuit open");
  }

  // Lightweight healthcheck (at most once / 30s per binding)
  const lastHealth = runtimeState?.last_healthcheck_at ? new Date(runtimeState.last_healthcheck_at).getTime() : 0;
  if (server.healthcheck_path && now - lastHealth > 30_000) {
    const hcUrl = `${String(server.endpoint).replace(/\/$/, "")}/${String(server.healthcheck_path).replace(/^\//, "")}`;
    const hcResp = await fetch(hcUrl, { method: "GET" }).catch(() => null);
    const hcOk = !!hcResp?.ok;

    await supabase
      .from("mcp_runtime_state")
      .update({
        last_healthcheck_at: new Date().toISOString(),
        last_health_status: hcOk ? "ok" : "fail",
      })
      .eq("tenant_id", tenantId)
      .eq("tenant_mcp_binding_id", binding.id);

    await recordMcpEvent(
      supabase,
      tenantId,
      binding.id,
      hcOk ? "healthcheck_ok" : "healthcheck_fail",
      { conversation_id: conversationId, healthcheck_url: hcUrl },
    );
  }

  const maxAttempts = Math.max(1, Number(binding.retry_max ?? 1) + 1);
  const timeoutMs = Math.max(1000, Number(binding.timeout_ms ?? 15000));

  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(toolDef.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof payload === "string" ? payload : JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const result = await response.json().catch(() => ({}));
      const latencyMs = Date.now() - start;

      if (response.ok) {
        await supabase
          .from("mcp_runtime_state")
          .update({
            failure_count: 0,
            circuit_state: "closed",
            circuit_open_until: null,
            last_success_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("tenant_id", tenantId)
          .eq("tenant_mcp_binding_id", binding.id);

        await recordMcpEvent(supabase, tenantId, binding.id, "invoke_ok", {
          conversation_id: conversationId,
          tool_id: toolDef.tool_id,
          latency_ms: latencyMs,
        });

        return { ok: true, status: response.status, latencyMs, result, route: "mcp" };
      }

      lastError = new Error(`MCP invoke failed with status ${response.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  const threshold = Math.max(1, Number(binding.circuit_breaker_threshold ?? 5));
  const newFailureCount = Number(runtimeState?.failure_count || 0) + 1;
  const shouldOpenCircuit = newFailureCount >= threshold;
  const openUntil = shouldOpenCircuit
    ? new Date(Date.now() + 60_000).toISOString()
    : null;

  await supabase
    .from("mcp_runtime_state")
    .update({
      failure_count: newFailureCount,
      circuit_state: shouldOpenCircuit ? "open" : "closed",
      circuit_open_until: openUntil,
      last_failure_at: new Date().toISOString(),
      last_error: lastError instanceof Error ? lastError.message : "Unknown MCP invoke error",
    })
    .eq("tenant_id", tenantId)
    .eq("tenant_mcp_binding_id", binding.id);

  await recordMcpEvent(supabase, tenantId, binding.id, "invoke_fail", {
    conversation_id: conversationId,
    tool_id: toolDef.tool_id,
    error: lastError instanceof Error ? lastError.message : "Unknown MCP invoke error",
  });

  if (shouldOpenCircuit) {
    await recordMcpEvent(supabase, tenantId, binding.id, "circuit_opened", {
      conversation_id: conversationId,
      tool_id: toolDef.tool_id,
      open_until: openUntil,
      failure_count: newFailureCount,
    });
  }

  throw (lastError instanceof Error ? lastError : new Error("Unknown MCP invoke error"));
}

async function getRecentToolFailureCount(
  supabase: any,
  conversationId: string,
): Promise<number> {
  const { data } = await supabase
    .from("tool_call_logs")
    .select("status")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(6);

  if (!data?.length) return 0;
  return data.filter((row: any) => row.status === "error" || row.status === "timeout").length;
}

function evaluateAutoHandoffPolicy(
  userMessage: string,
  llmContent: string,
  toolFailureCount: number,
): { trigger: boolean; priority: "normal" | "urgent"; reasonCode: string; reasonText: string } {
  const answer = llmContent.toLowerCase();

  const explicitUserRequest = /(human|real person|agent|support staff|nhân viên|người thật|chuyển.*(nhân viên|agent)|gặp.*(người|nhân viên))/i.test(userMessage);
  if (explicitUserRequest) {
    return {
      trigger: true,
      priority: "normal",
      reasonCode: "user_request",
      reasonText: "User explicitly requested human support",
    };
  }

  const severeBugSignal = /(critical|urgent|production down|cannot login|payment failed|security issue|khẩn cấp|nghiêm trọng|không đăng nhập|thanh toán lỗi|hệ thống sập)/i.test(userMessage);
  if (severeBugSignal) {
    return {
      trigger: true,
      priority: "urgent",
      reasonCode: "severe_bug_signal",
      reasonText: "Detected severe bug / urgent issue indicators",
    };
  }

  const lowConfidenceLanguage = /(i\s*am\s*not\s*sure|i\s*can't\s*determine|insufficient information|không chắc|không thể xác định|không có đủ thông tin|xin lỗi.*không)/i.test(answer);
  if (lowConfidenceLanguage) {
    return {
      trigger: true,
      priority: "normal",
      reasonCode: "low_confidence_pattern",
      reasonText: "Assistant response indicates low confidence",
    };
  }

  const mcpDegraded = /(công cụ.*không khả dụng|hệ thống công cụ đang quá tải|mcp|tool unavailable|tooling degraded|tra cứu thông tin)/i.test(answer);
  if (mcpDegraded && toolFailureCount >= 1) {
    return {
      trigger: true,
      priority: "normal",
      reasonCode: "mcp_degraded",
      reasonText: `Tooling/MCP degradation detected (${toolFailureCount} failure)` ,
    };
  }

  if (toolFailureCount >= 2) {
    return {
      trigger: true,
      priority: "normal",
      reasonCode: "tool_failures",
      reasonText: `Repeated tool failures detected (${toolFailureCount})`,
    };
  }

  return {
    trigger: false,
    priority: "normal",
    reasonCode: "none",
    reasonText: "",
  };
}

async function ensureAutoHandoff(
  supabase: any,
  tenantId: string,
  conversationId: string,
  priority: "normal" | "urgent",
  reasonCode: string,
  reasonText: string,
): Promise<{ created: boolean; reason: string }> {
  const { data: existing } = await supabase
    .from("handoff_events")
    .select("id")
    .eq("conversation_id", conversationId)
    .in("status", ["pending", "assigned"])
    .limit(1);

  if (existing?.length) {
    return { created: false, reason: `[auto:${reasonCode}] ${reasonText}` };
  }

  const reason = `[auto:${reasonCode}] ${reasonText}`;

  await supabase.from("handoff_events").insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    priority,
    reason,
    status: "pending",
  });

  await supabase
    .from("conversations")
    .update({ status: "handoff", updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return { created: true, reason };
}

// ==================== MAIN HANDLER ====================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, message, conversation_id, end_user, attachments } = await req.json();
    const traceId = buildTraceId();

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
          details: { trace_id: traceId, message_preview: message.substring(0, 200) },
        });
        return new Response(JSON.stringify({
          conversation_id: conversation_id || null,
          trace_id: traceId,
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
          end_user_role: end_user?.role || null,
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

    const userRef = resolveUserRef(end_user, convId);
    if (tenantConfig.memory_v2_enabled) {
      await applyMemoryDecayV2(supabase, tenant_id, tenantConfig.memory_decay_days || 30);
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
    const { data: insertedUserMessage } = await supabase
      .from("messages")
      .insert({
        conversation_id: convId,
        role: "user",
        content: message || "[attachment]",
      })
      .select("id")
      .single();

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

    let matchedSkills: RuntimeSkill[] = [];
    let skillsSystemAddition = "";
    let skillToolAllowlist: string[] = [];

    if (tenantConfig.skills_runtime_enabled) {
      try {
        const tenantSkills = await loadTenantRuntimeSkills(supabase, tenant_id);
        const resolved = resolveSkillsForMessage(tenantSkills, message);
        matchedSkills = resolved.matchedSkills;
        skillsSystemAddition = resolved.skillsSystemAddition;
        skillToolAllowlist = resolved.skillToolAllowlist;
      } catch (skillErr) {
        console.warn("Skill runtime resolution failed:", skillErr);
      }
    }

    // 7. Memory context (memory v2 first, fallback to bot_memory)
    let memoryContext = "";
    try {
      if (tenantConfig.memory_v2_enabled) {
        memoryContext = await recallMemoryContextV2(
          supabase,
          tenant_id,
          userRef,
          message,
          convId,
        );
      }

      if (!memoryContext) {
        const { data: memoryEntries } = await supabase
          .from("bot_memory")
          .select("category, title, content")
          .eq("tenant_id", tenant_id)
          .eq("enabled", true)
          .order("priority", { ascending: false })
          .limit(50);

        if (memoryEntries?.length) {
          const grouped: Record<string, string[]> = {};
          for (const entry of memoryEntries) {
            const cat = entry.category || "rule";
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(`- ${entry.title}: ${entry.content}`);
          }
          const sections = Object.entries(grouped)
            .map(([cat, items]) => `[${cat.toUpperCase()}]\n${items.join("\n")}`)
            .join("\n\n");
          memoryContext = sections;
        }
      }
    } catch (e) {
      console.warn("Failed to load memory context:", e);
    }

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
        memoryContext,
        skillsSystemAddition,
        skillToolAllowlist,
      );

      if (result.response) {
        // Save bot response
        const { data: insertedBotMessage } = await supabase
          .from("messages")
          .insert({
            conversation_id: convId,
            role: "bot",
            content: result.response,
            tool_used: result.tool_used || null,
            tool_latency_ms: result.tool_latency_ms || null,
            sources: result.sources?.length ? result.sources : null,
          })
          .select("id")
          .single();

        if (tenantConfig.memory_v2_enabled) {
          const minConfidence = Number(tenantConfig.memory_min_confidence ?? 0.55);
          const candidates = (await extractMemoryCandidatesAdvanced(message, tenantConfig))
            .filter((candidate) => candidate.confidence >= minConfidence);
          await persistMemoryCandidatesV2(
            supabase,
            tenant_id,
            userRef,
            convId,
            insertedUserMessage?.id || insertedBotMessage?.id || null,
            candidates,
          );
        }

        // Update conversation metadata with new flow state
        const newMetadata = {
          ...conversationMetadata,
          flow_state: result.new_state,
        };
        await supabase.from("conversations").update({
          metadata: newMetadata,
          updated_at: new Date().toISOString(),
        }).eq("id", convId);

        const toolFailureCount = await getRecentToolFailureCount(supabase, convId);
        const policy = evaluateAutoHandoffPolicy(message, result.response, toolFailureCount);

        let finalHandoff = result.handoff || null;
        if (!finalHandoff && policy.trigger) {
          const auto = await ensureAutoHandoff(
            supabase,
            tenant_id,
            convId,
            policy.priority,
            policy.reasonCode,
            policy.reasonText,
          );

          if (auto.created) {
            finalHandoff = { priority: policy.priority, reason: auto.reason };
          }
        }

        await supabase.from("audit_logs").insert({
          tenant_id,
          actor_type: "bot",
          action: "flow_chat_response",
          resource_type: "conversation",
          resource_id: convId,
          details: {
            trace_id: traceId,
            flow_id: activeFlow.flowId,
            current_node: result.new_state?.current_node_id || "ended",
            step_count: result.new_state?.step_count || 0,
            tool_used: result.tool_used,
            handoff: finalHandoff,
            skills_applied: matchedSkills.map((s) => s.skill_id),
            tool_failure_count: toolFailureCount,
          },
        });

        if (finalHandoff && tenantConfig.webhook_url) {
          dispatchWebhook(tenantConfig.webhook_url, {
            event: "handoff.triggered",
            tenant_id,
            conversation_id: convId,
            priority: finalHandoff.priority,
            reason: finalHandoff.reason,
          }).catch(() => {});
        }

        return new Response(JSON.stringify({
          conversation_id: convId,
          trace_id: traceId,
          response: finalHandoff
            ? `${result.response}\n\nTôi đã chuyển yêu cầu của bạn tới đội hỗ trợ để xử lý nhanh hơn.`
            : result.response,
          citations: result.sources || [],
          tool_calls: result.tool_used ? [{ tool_id: result.tool_used, latency_ms: result.tool_latency_ms || null }] : [],
          handoff: finalHandoff,
          tool_used: result.tool_used,
          tool_latency_ms: result.tool_latency_ms,
          sources: result.sources,
          flow_active: true,
          flow_node: result.new_state?.current_node_id || null,
          skills_applied: matchedSkills.map((s) => s.skill_id),
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
      `${hasKbImportedFiles
        ? "\n\nNote: The user uploaded files imported to knowledge base. Use context above."
        : ""}${skillsSystemAddition}`,
      enabledTools,
      memoryContext,
      supabase,
      tenant_id,
      skillToolAllowlist,
      convId,
    );

    // Save bot response
    const { data: insertedBotMessage } = await supabase
      .from("messages")
      .insert({
        conversation_id: convId,
        role: "bot",
        content: llmResult.content,
        tool_used: llmResult.tool_used || null,
        tool_latency_ms: llmResult.tool_latency_ms || null,
        sources: ragSources.length > 0 ? ragSources : null,
      })
      .select("id")
      .single();

    if (tenantConfig.memory_v2_enabled) {
      const minConfidence = Number(tenantConfig.memory_min_confidence ?? 0.55);
      const candidates = (await extractMemoryCandidatesAdvanced(message, tenantConfig))
        .filter((candidate) => candidate.confidence >= minConfidence);
      await persistMemoryCandidatesV2(
        supabase,
        tenant_id,
        userRef,
        convId,
        insertedUserMessage?.id || insertedBotMessage?.id || null,
        candidates,
      );
    }

    const toolFailureCount = await getRecentToolFailureCount(supabase, convId);
    const policy = evaluateAutoHandoffPolicy(message, llmResult.content, toolFailureCount);

    let finalHandoff: { priority: string; reason: string } | null = null;
    if (policy.trigger) {
      const auto = await ensureAutoHandoff(
        supabase,
        tenant_id,
        convId,
        policy.priority,
        policy.reasonCode,
        policy.reasonText,
      );
      if (auto.created) {
        finalHandoff = { priority: policy.priority, reason: auto.reason };
      }
    }

    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);

    await supabase.from("audit_logs").insert({
      tenant_id,
      actor_type: "bot",
      action: "chat_response",
      resource_type: "conversation",
      resource_id: convId,
      details: {
        trace_id: traceId,
        tool_used: llmResult.tool_used,
        model: tenantConfig.provider_model,
        rag_sources: ragSources,
        skills_applied: matchedSkills.map((s) => s.skill_id),
        handoff: finalHandoff,
        tool_failure_count: toolFailureCount,
      },
    });

    if (finalHandoff && tenantConfig.webhook_url) {
      dispatchWebhook(tenantConfig.webhook_url, {
        event: "handoff.triggered",
        tenant_id,
        conversation_id: convId,
        priority: finalHandoff.priority,
        reason: finalHandoff.reason,
      }).catch(() => {});
    } else if (tenantConfig.webhook_url && llmResult.content.includes("chuyển cho nhân viên")) {
      dispatchWebhook(tenantConfig.webhook_url, {
        event: "handoff.suggested",
        tenant_id,
        conversation_id: convId,
        reason: "Bot suggested agent handoff",
      }).catch(() => {});
    }

    return new Response(JSON.stringify({
      conversation_id: convId,
      trace_id: traceId,
      response: finalHandoff
        ? `${llmResult.content}\n\nTôi đã chuyển yêu cầu của bạn tới đội hỗ trợ để xử lý nhanh hơn.`
        : llmResult.content,
      citations: ragSources,
      tool_calls: llmResult.tool_used ? [{ tool_id: llmResult.tool_used, latency_ms: llmResult.tool_latency_ms || null }] : [],
      handoff: finalHandoff,
      tool_used: llmResult.tool_used,
      tool_latency_ms: llmResult.tool_latency_ms,
      sources: ragSources,
      flow_active: false,
      skills_applied: matchedSkills.map((s) => s.skill_id),
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
