import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const tenantId = body.tenant_id as string;

    if (!tenantId) {
      return new Response(JSON.stringify({ ok: false, errors: ["tenant_id is required"], warnings: [] }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const errors: string[] = [];
    const warnings: string[] = [];

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, slug, status")
      .eq("id", tenantId)
      .maybeSingle();

    if (!tenant) {
      return new Response(JSON.stringify({ ok: false, errors: ["tenant not found"], warnings }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await supabase
      .from("tenant_configs")
      .select("id, memory_v2_enabled, skills_runtime_enabled, mcp_gateway_enabled")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!config) warnings.push("tenant_configs missing; bootstrap will create defaults");

    const skillPacks = Array.isArray(body.skills?.packs) ? body.skills.packs : [];
    for (const pack of skillPacks) {
      if (!pack.skill_id) errors.push("skills.packs[].skill_id is required");
      if (!pack.name) warnings.push(`skill pack ${pack.skill_id || "<unknown>"} missing name`);
    }

    const mcpServers = Array.isArray(body.mcp?.servers) ? body.mcp.servers : [];
    for (const server of mcpServers) {
      if (!server.server_key) errors.push("mcp.servers[].server_key is required");
      if (!server.endpoint) errors.push(`mcp server ${server.server_key || "<unknown>"} missing endpoint`);
    }

    const plan = {
      tenant,
      will_configure: {
        memory_v2_enabled: body.memory?.enable_v2 ?? true,
        skills_runtime_enabled: body.skills?.enable_runtime ?? true,
        mcp_gateway_enabled: body.mcp?.enable_gateway ?? true,
      },
      incoming: {
        skill_packs: skillPacks.length,
        mcp_servers: mcpServers.length,
      },
      existing: {
        has_config: !!config,
      },
    };

    await supabase.from("tenant_bootstrap_runs").insert({
      tenant_id: tenantId,
      mode: "validate",
      status: errors.length ? "failed" : "validated",
      request: body,
      result: { errors, warnings, plan },
      error_message: errors.length ? errors.join("; ") : null,
      finished_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ ok: errors.length === 0, errors, warnings, plan }), {
      status: errors.length ? 400 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
