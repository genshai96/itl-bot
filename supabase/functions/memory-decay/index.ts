import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const targetTenantId = body.tenant_id as string | undefined;

    let configQuery = supabase
      .from("tenant_configs")
      .select("tenant_id, memory_v2_enabled, memory_decay_days")
      .eq("memory_v2_enabled", true);

    if (targetTenantId) {
      configQuery = configQuery.eq("tenant_id", targetTenantId);
    }

    const { data: tenantConfigs, error: configError } = await configQuery;
    if (configError) throw configError;

    const summary: Array<{ tenant_id: string; expired_count: number }> = [];

    for (const cfg of tenantConfigs || []) {
      const tenantId = cfg.tenant_id;
      const decayDays = Number(cfg.memory_decay_days || 30);
      const cutoff = new Date(Date.now() - decayDays * 24 * 60 * 60 * 1000).toISOString();

      const { data: staleItems } = await supabase
        .from("memory_items")
        .select("id, user_ref")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .lt("last_seen_at", cutoff)
        .is("expires_at", null)
        .limit(500);

      const staleIds = (staleItems || []).map((row: any) => row.id);
      if (staleIds.length) {
        await supabase
          .from("memory_items")
          .update({ status: "expired" })
          .in("id", staleIds);

        await supabase.from("memory_access_logs").insert(
          staleItems!.map((row: any) => ({
            tenant_id: tenantId,
            conversation_id: null,
            user_ref: row.user_ref,
            memory_item_id: row.id,
            action: "expire",
            metadata: { reason: "memory_decay_worker", cutoff },
          })),
        );
      }

      await supabase
        .from("memory_conflicts")
        .update({ status: "ignored", resolution_note: "Auto-ignored by decay worker", resolved_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        .lt("created_at", cutoff);

      summary.push({ tenant_id: tenantId, expired_count: staleIds.length });
    }

    return new Response(JSON.stringify({ ok: true, tenants_processed: summary.length, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("memory-decay error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
