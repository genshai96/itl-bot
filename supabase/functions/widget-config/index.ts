import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Widget config endpoint — returns public widget config for a tenant slug.
 * Called by the embedded widget script before rendering.
 * GET /widget-config?slug=acme-corp
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");

    if (!slug) {
      return new Response(JSON.stringify({ error: "slug parameter is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get tenant by slug
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug, status")
      .eq("slug", slug)
      .eq("status", "active")
      .single();

    if (tenantError || !tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found or inactive" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get widget config
    const { data: config } = await supabase
      .from("tenant_configs")
      .select(`
        widget_primary_color,
        widget_position,
        widget_title,
        widget_subtitle,
        widget_placeholder,
        widget_welcome_message,
        widget_collect_name,
        widget_collect_email,
        widget_collect_phone,
        widget_collect_role,
        widget_role_options,
        widget_auto_open,
        widget_auto_open_delay,
        widget_show_powered_by
      `)
      .eq("tenant_id", tenant.id)
      .single();

    return new Response(JSON.stringify({
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      config: config || {},
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Widget config error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
