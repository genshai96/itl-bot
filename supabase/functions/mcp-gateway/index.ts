import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "health" | "invoke" | "state" | "reset_circuit";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = (body.action || "state") as Action;
    const tenantId = body.tenant_id as string;

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "state") {
      const { data, error } = await supabase
        .from("mcp_runtime_state")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ state: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bindingId = body.tenant_mcp_binding_id as string;
    if (!bindingId) {
      return new Response(JSON.stringify({ error: "tenant_mcp_binding_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: binding } = await supabase
      .from("tenant_mcp_bindings")
      .select("id, tenant_id, enabled, mcp_server_id")
      .eq("id", bindingId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!binding?.enabled) {
      return new Response(JSON.stringify({ error: "binding not found or disabled" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: server } = await supabase
      .from("mcp_servers")
      .select("id, endpoint, healthcheck_path, status")
      .eq("id", binding.mcp_server_id)
      .maybeSingle();

    if (!server || server.status === "disabled") {
      return new Response(JSON.stringify({ error: "mcp server unavailable" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "health") {
      const hcPath = String(server.healthcheck_path || "").replace(/^\//, "");
      const url = hcPath
        ? `${String(server.endpoint).replace(/\/$/, "")}/${hcPath}`
        : String(server.endpoint);

      const startedAt = Date.now();
      const resp = await fetch(url, { method: "GET" }).catch(() => null);
      const ok = !!resp?.ok;
      const latency = Date.now() - startedAt;

      await supabase
        .from("mcp_runtime_state")
        .upsert({
          tenant_id: tenantId,
          tenant_mcp_binding_id: bindingId,
          last_healthcheck_at: new Date().toISOString(),
          last_health_status: ok ? "ok" : "fail",
        }, { onConflict: "tenant_id,tenant_mcp_binding_id" });

      await supabase.from("mcp_health_events").insert({
        tenant_id: tenantId,
        tenant_mcp_binding_id: bindingId,
        event_type: ok ? "healthcheck_ok" : "healthcheck_fail",
        details: { url, latency_ms: latency },
      });

      return new Response(JSON.stringify({ ok, status: resp?.status || 0, latency_ms: latency, url }), {
        status: ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_circuit") {
      await supabase
        .from("mcp_runtime_state")
        .upsert({
          tenant_id: tenantId,
          tenant_mcp_binding_id: bindingId,
          failure_count: 0,
          circuit_state: "closed",
          circuit_open_until: null,
          last_error: null,
        }, { onConflict: "tenant_id,tenant_mcp_binding_id" });

      await supabase.from("mcp_health_events").insert({
        tenant_id: tenantId,
        tenant_mcp_binding_id: bindingId,
        event_type: "circuit_reset",
        details: { by: "mcp-gateway" },
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "invoke") {
      const endpoint = String(body.endpoint || server.endpoint);
      const method = String(body.method || "POST").toUpperCase();
      const payload = body.payload ?? {};

      const startedAt = Date.now();
      const resp = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(payload),
      }).catch(() => null);
      const latency = Date.now() - startedAt;

      const responseJson = resp ? await resp.json().catch(() => ({})) : { error: "Network failure" };
      const ok = !!resp?.ok;

      if (ok) {
        await supabase
          .from("mcp_runtime_state")
          .upsert({
            tenant_id: tenantId,
            tenant_mcp_binding_id: bindingId,
            failure_count: 0,
            circuit_state: "closed",
            circuit_open_until: null,
            last_success_at: new Date().toISOString(),
            last_error: null,
          }, { onConflict: "tenant_id,tenant_mcp_binding_id" });
      } else {
        const { data: state } = await supabase
          .from("mcp_runtime_state")
          .select("failure_count")
          .eq("tenant_id", tenantId)
          .eq("tenant_mcp_binding_id", bindingId)
          .maybeSingle();
        const failures = Number(state?.failure_count || 0) + 1;
        const open = failures >= Number(body.circuit_breaker_threshold || 5);

        await supabase
          .from("mcp_runtime_state")
          .upsert({
            tenant_id: tenantId,
            tenant_mcp_binding_id: bindingId,
            failure_count: failures,
            circuit_state: open ? "open" : "closed",
            circuit_open_until: open ? new Date(Date.now() + 60_000).toISOString() : null,
            last_failure_at: new Date().toISOString(),
            last_error: `invoke failed status ${resp?.status || 0}`,
          }, { onConflict: "tenant_id,tenant_mcp_binding_id" });
      }

      await supabase.from("mcp_health_events").insert({
        tenant_id: tenantId,
        tenant_mcp_binding_id: bindingId,
        event_type: ok ? "invoke_ok" : "invoke_fail",
        details: { endpoint, method, status: resp?.status || 0, latency_ms: latency },
      });

      return new Response(JSON.stringify({ ok, status: resp?.status || 0, latency_ms: latency, response: responseJson }), {
        status: ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unsupported action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("mcp-gateway error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
