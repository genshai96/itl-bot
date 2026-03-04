import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Proxy endpoint to fetch available models from an OpenAI-compatible API.
 * POST { endpoint: string, api_key: string }
 * Returns { models: Array<{ id, name, owned_by? }> }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { endpoint, api_key } = await req.json();

    if (!endpoint || !api_key) {
      return new Response(JSON.stringify({ error: "endpoint and api_key are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize endpoint: strip /chat/completions or trailing /v1 paths, ensure /models
    let baseUrl = endpoint.replace(/\/+$/, "");
    baseUrl = baseUrl.replace(/\/chat\/completions$/, "");
    // If it doesn't end with /v1, check if it ends with /v1/ variants
    const modelsUrl = `${baseUrl}/models`;

    console.log(`Fetching models from: ${modelsUrl}`);

    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Models API error [${response.status}]:`, errorText);
      return new Response(JSON.stringify({
        error: `Provider returned ${response.status}`,
        details: errorText.substring(0, 500),
      }), {
        status: 200, // Return 200 to client with error info
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    // OpenAI-compatible format: { data: [{ id, object, owned_by }] }
    // Some providers return { models: [...] } or just [...]
    let models: Array<{ id: string; name?: string; owned_by?: string }> = [];

    if (Array.isArray(data?.data)) {
      models = data.data.map((m: Record<string, unknown>) => ({
        id: String(m.id || ""),
        name: String(m.name || m.id || ""),
        owned_by: m.owned_by ? String(m.owned_by) : undefined,
      }));
    } else if (Array.isArray(data?.models)) {
      models = data.models.map((m: Record<string, unknown>) => ({
        id: String(m.id || m.model || ""),
        name: String(m.name || m.id || m.model || ""),
        owned_by: m.owned_by ? String(m.owned_by) : undefined,
      }));
    } else if (Array.isArray(data)) {
      models = data.map((m: Record<string, unknown>) => ({
        id: String(m.id || m.model || ""),
        name: String(m.name || m.id || m.model || ""),
      }));
    }

    // Sort by id
    models.sort((a, b) => a.id.localeCompare(b.id));

    return new Response(JSON.stringify({ models, total: models.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Fetch models error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
