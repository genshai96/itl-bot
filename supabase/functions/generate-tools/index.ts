import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description, tenant_name } = await req.json();

    if (!description) {
      return new Response(JSON.stringify({ error: "description is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a tool definition generator for an AI chatbot platform. Given a description of what a tool should do, generate a complete tool definition in JSON format.

The tool definition must include:
- "name": Human-readable name (e.g. "Check Order Status")
- "tool_id": Machine-readable ID using snake_case (e.g. "check_order_status")
- "description": Clear description of what the tool does for the AI to understand when to use it
- "endpoint": A placeholder webhook URL (use https://api.example.com/tools/{tool_id})
- "input_schema": A valid JSON Schema object describing the parameters the tool accepts

Example output:
{
  "name": "Check Order Status",
  "tool_id": "check_order_status",
  "description": "Look up the current status of a customer order by order ID or email address",
  "endpoint": "https://api.example.com/tools/check_order_status",
  "input_schema": {
    "type": "object",
    "properties": {
      "order_id": { "type": "string", "description": "The order ID to look up" },
      "email": { "type": "string", "description": "Customer email for verification" }
    },
    "required": ["order_id"]
  }
}

Generate ONLY the JSON object, no markdown, no explanation. If the description mentions multiple tools, generate an array of tool objects.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Tenant: ${tenant_name || "Unknown"}\n\nTool description: ${description}` },
        ],
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", errorText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the JSON from the AI response
    let tools;
    try {
      // Remove potential markdown code fences
      const cleaned = content.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
      tools = JSON.parse(cleaned);
      // Normalize to array
      if (!Array.isArray(tools)) tools = [tools];
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI response", raw: content }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ tools }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Generate tools error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
