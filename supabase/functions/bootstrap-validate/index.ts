import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

class HttpError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const tenantId = body.tenant_id as string;

    if (!tenantId) {
      return jsonResponse(400, { ok: false, error: "tenant_id is required", code: "missing_tenant_id", errors: ["tenant_id is required"], warnings: [] });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const errors: string[] = [];
    const warnings: string[] = [];

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug, status")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError) throw new HttpError(500, "Failed to load tenant", "tenant_lookup_failed", tenantError);
    if (!tenant) {
      return jsonResponse(404, { ok: false, error: "tenant not found", code: "tenant_not_found", errors: ["tenant not found"], warnings });
    }

    const { data: config, error: configError } = await supabase
      .from("tenant_configs")
      .select("id, memory_v2_enabled, skills_runtime_enabled, mcp_gateway_enabled")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (configError) throw new HttpError(500, "Failed to load tenant config", "tenant_config_lookup_failed", configError);
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

    const { error: runError } = await supabase.from("tenant_bootstrap_runs").insert({
      tenant_id: tenantId,
      mode: "validate",
      status: errors.length ? "failed" : "validated",
      request: body,
      result: { errors, warnings, plan },
      error_message: errors.length ? errors.join("; ") : null,
      finished_at: new Date().toISOString(),
    });

    if (runError) {
      throw new HttpError(500, "Failed to record bootstrap validation run", "bootstrap_run_insert_failed", runError);
    }

    return jsonResponse(errors.length ? 400 : 200, {
      ok: errors.length === 0,
      error: errors.length ? errors.join("; ") : null,
      errors,
      warnings,
      plan,
    });
  } catch (error) {
    const appError = error instanceof HttpError
      ? error
      : new HttpError(500, error instanceof Error ? error.message : "Unknown error", "bootstrap_validate_failed", error);

    return jsonResponse(appError.status, {
      ok: false,
      error: appError.message,
      code: appError.code,
      details: appError.details,
    });
  }
});
