import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SkillAction =
  | "list_registry"
  | "list_tenant"
  | "bind"
  | "set_status"
  | "unbind"
  | "resolve";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = (body.action || "list_registry") as SkillAction;
    const tenantId = body.tenant_id as string | undefined;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "list_registry") {
      const { data, error } = await supabase
        .from("skills_registry")
        .select("id, skill_id, name, description, version, category, status, manifest, updated_at")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ skills: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_tenant") {
      const { data, error } = await supabase
        .from("tenant_skill_bindings")
        .select("id, status, pinned_version, config, created_at, updated_at, skills_registry:skill_registry_id(skill_id, name, version, status, manifest)")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ bindings: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "bind") {
      const skillId = String(body.skill_id || "");
      const status = String(body.status || "test");
      const pinnedVersion = body.pinned_version ? String(body.pinned_version) : null;
      const config = body.config || {};

      if (!skillId) {
        return new Response(JSON.stringify({ error: "skill_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: registry, error: registryError } = await supabase
        .from("skills_registry")
        .select("id, version")
        .eq("skill_id", skillId)
        .maybeSingle();

      if (registryError) throw registryError;
      if (!registry?.id) {
        return new Response(JSON.stringify({ error: `skill_id not found: ${skillId}` }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload = {
        tenant_id: tenantId,
        skill_registry_id: registry.id,
        status,
        pinned_version: pinnedVersion || registry.version,
        config,
      };

      const { data, error } = await supabase
        .from("tenant_skill_bindings")
        .upsert(payload, { onConflict: "tenant_id,skill_registry_id" })
        .select("id, tenant_id, status, pinned_version, config, updated_at")
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ binding: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set_status") {
      const bindingId = String(body.binding_id || "");
      const status = String(body.status || "");

      if (!bindingId || !status) {
        return new Response(JSON.stringify({ error: "binding_id and status are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("tenant_skill_bindings")
        .update({
          status,
          pinned_version: body.pinned_version ? String(body.pinned_version) : undefined,
          config: body.config ?? undefined,
        })
        .eq("id", bindingId)
        .eq("tenant_id", tenantId)
        .select("id, tenant_id, status, pinned_version, config, updated_at")
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ binding: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unbind") {
      const bindingId = String(body.binding_id || "");
      if (!bindingId) {
        return new Response(JSON.stringify({ error: "binding_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase
        .from("tenant_skill_bindings")
        .delete()
        .eq("id", bindingId)
        .eq("tenant_id", tenantId);

      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "resolve") {
      const message = String(body.message || "");
      const { data: bindings, error } = await supabase
        .from("tenant_skill_bindings")
        .select("id, status, pinned_version, config, skills_registry:skill_registry_id(skill_id, name, version, manifest)")
        .eq("tenant_id", tenantId)
        .in("status", ["active", "test"])
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const lc = message.toLowerCase();
      const matched = (bindings || []).filter((row: any) => {
        const manifestTriggers = Array.isArray(row.skills_registry?.manifest?.triggers)
          ? row.skills_registry.manifest.triggers
          : [];
        const configTriggers = Array.isArray(row.config?.triggers)
          ? row.config.triggers
          : [];
        const triggers = [...manifestTriggers, ...configTriggers].map((x: any) => String(x).toLowerCase());
        const alwaysOn = row.config?.always_on === true || row.skills_registry?.manifest?.always_on === true;
        return alwaysOn || triggers.some((t: string) => t && lc.includes(t));
      });

      return new Response(JSON.stringify({
        matched_skills: matched.map((row: any) => ({
          binding_id: row.id,
          skill_id: row.skills_registry?.skill_id,
          name: row.skills_registry?.name,
          status: row.status,
          version: row.pinned_version || row.skills_registry?.version,
          instruction: row.config?.instruction || row.skills_registry?.manifest?.instruction || null,
          allowed_tools: [
            ...(Array.isArray(row.skills_registry?.manifest?.allowed_tools) ? row.skills_registry.manifest.allowed_tools : []),
            ...(Array.isArray(row.config?.allowed_tools) ? row.config.allowed_tools : []),
          ],
        })),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unsupported action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("skills function error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
