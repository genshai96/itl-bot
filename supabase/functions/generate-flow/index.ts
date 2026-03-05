import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a conversation flow designer. Generate a flow configuration as JSON for a chatbot flow builder.

The flow must contain nodes and edges arrays. Available node types:
- trigger: Starting point. Data: { label, type: "trigger", intent: "any"|"billing"|"support"|etc }
- message: Send a message. Data: { label, type: "message", message: "text" }
- condition: Branch logic. Data: { label, type: "condition", condition: "expression" }. Has two source handles: "yes" and "no"
- botResponse: AI-generated response. Data: { label, type: "botResponse", message: "context" }
- tool: Call external tool. Data: { label, type: "tool", toolId: "tool_name" }
- handoff: Escalate to human. Data: { label, type: "handoff", priority: "low"|"normal"|"high" }

Rules:
1. Must have at least 1 trigger node
2. All non-trigger nodes must be connected via edges
3. Condition nodes MUST have both "yes" and "no" output edges (sourceHandle: "yes" and sourceHandle: "no")
4. Position nodes in a readable layout (x: 50-600, y: 30-800, ~130px vertical spacing)
5. Use unique string IDs for nodes and edges

Return ONLY valid JSON with this structure:
{
  "name": "Flow Name",
  "description": "Brief description",
  "config": {
    "nodes": [...],
    "edges": [...]
  }
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    const parsed = JSON.parse(jsonStr.trim());

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-flow error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
