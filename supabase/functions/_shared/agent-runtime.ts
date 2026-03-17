import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createServiceRoleClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function resolveAgentById(supabase: any, agentId: string) {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function resolveDefaultAgentForTenant(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_default", true)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function resolveActiveAgentConfig(supabase: any, agentId: string) {
  const { data, error } = await supabase
    .from("agent_configs")
    .select("*")
    .eq("agent_id", agentId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function resolveEnabledAgentSkills(supabase: any, agentId: string) {
  const { data, error } = await supabase
    .from("agent_skill_bindings")
    .select("id, status, priority, pinned_version, config, skills_registry:skill_registry_id(id, skill_id, name, version, manifest)")
    .eq("agent_id", agentId)
    .in("status", ["test", "active"])
    .order("priority", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function resolvePrimaryAgentFlow(supabase: any, agentId: string) {
  const { data, error } = await supabase
    .from("agent_flow_bindings")
    .select("*, flow_definitions:flow_id(id, tenant_id, name, is_active), flow_versions:flow_version_id(id, version, status, config)")
    .eq("agent_id", agentId)
    .eq("is_active", true)
    .eq("mode", "primary")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function resolveRuntimeForAgent(
  supabase: any,
  input: { tenantId: string; agentId?: string | null },
) {
  const agent = input.agentId
    ? await resolveAgentById(supabase, input.agentId)
    : await resolveDefaultAgentForTenant(supabase, input.tenantId);

  if (!agent) {
    return {
      agent: null,
      config: null,
      skills: [],
      flow: null,
    };
  }

  const [config, skills, flow] = await Promise.all([
    resolveActiveAgentConfig(supabase, agent.id),
    resolveEnabledAgentSkills(supabase, agent.id),
    resolvePrimaryAgentFlow(supabase, agent.id),
  ]);

  return { agent, config, skills, flow };
}
