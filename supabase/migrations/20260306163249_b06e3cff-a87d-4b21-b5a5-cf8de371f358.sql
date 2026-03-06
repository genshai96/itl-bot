
-- Skills Registry
CREATE TABLE IF NOT EXISTS public.skills_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  version text NOT NULL DEFAULT '1.0.0',
  category text,
  status text NOT NULL DEFAULT 'active',
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.skills_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view skills registry" ON public.skills_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "System admins manage skills registry" ON public.skills_registry FOR ALL TO authenticated USING (is_system_admin(auth.uid()));

-- Tenant Skill Bindings
CREATE TABLE IF NOT EXISTS public.tenant_skill_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  skill_registry_id uuid NOT NULL REFERENCES public.skills_registry(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'test',
  pinned_version text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, skill_registry_id)
);
ALTER TABLE public.tenant_skill_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins manage skill bindings" ON public.tenant_skill_bindings FOR ALL TO authenticated USING (has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role) OR is_system_admin(auth.uid()));
CREATE POLICY "Tenant members view skill bindings" ON public.tenant_skill_bindings FOR SELECT TO authenticated USING (is_tenant_member(auth.uid(), tenant_id));

-- MCP Servers
CREATE TABLE IF NOT EXISTS public.mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_key text NOT NULL UNIQUE,
  name text NOT NULL,
  endpoint text NOT NULL,
  transport text NOT NULL DEFAULT 'http',
  auth_type text NOT NULL DEFAULT 'none',
  healthcheck_path text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view mcp servers" ON public.mcp_servers FOR SELECT TO authenticated USING (true);
CREATE POLICY "System admins manage mcp servers" ON public.mcp_servers FOR ALL TO authenticated USING (is_system_admin(auth.uid()));

-- Tenant MCP Bindings
CREATE TABLE IF NOT EXISTS public.tenant_mcp_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mcp_server_id uuid NOT NULL REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  timeout_ms integer NOT NULL DEFAULT 15000,
  retry_max integer NOT NULL DEFAULT 1,
  circuit_breaker_threshold integer NOT NULL DEFAULT 5,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, mcp_server_id)
);
ALTER TABLE public.tenant_mcp_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins manage mcp bindings" ON public.tenant_mcp_bindings FOR ALL TO authenticated USING (has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role) OR is_system_admin(auth.uid()));
CREATE POLICY "Tenant members view mcp bindings" ON public.tenant_mcp_bindings FOR SELECT TO authenticated USING (is_tenant_member(auth.uid(), tenant_id));

-- MCP Tool Policies
CREATE TABLE IF NOT EXISTS public.mcp_tool_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_mcp_binding_id uuid REFERENCES public.tenant_mcp_bindings(id) ON DELETE SET NULL,
  tool_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  pii_scope text NOT NULL DEFAULT 'masked',
  max_calls_per_minute integer,
  required_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, tool_id)
);
ALTER TABLE public.mcp_tool_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins manage mcp tool policies" ON public.mcp_tool_policies FOR ALL TO authenticated USING (has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role) OR is_system_admin(auth.uid()));
CREATE POLICY "Tenant members view mcp tool policies" ON public.mcp_tool_policies FOR SELECT TO authenticated USING (is_tenant_member(auth.uid(), tenant_id));

-- MCP Runtime State
CREATE TABLE IF NOT EXISTS public.mcp_runtime_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_mcp_binding_id uuid NOT NULL REFERENCES public.tenant_mcp_bindings(id) ON DELETE CASCADE,
  failure_count integer NOT NULL DEFAULT 0,
  circuit_state text NOT NULL DEFAULT 'closed',
  circuit_open_until timestamptz,
  last_healthcheck_at timestamptz,
  last_health_status text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, tenant_mcp_binding_id)
);
ALTER TABLE public.mcp_runtime_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins manage mcp runtime state" ON public.mcp_runtime_state FOR ALL TO authenticated USING (has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role) OR is_system_admin(auth.uid()));
CREATE POLICY "Tenant members view mcp runtime state" ON public.mcp_runtime_state FOR SELECT TO authenticated USING (is_tenant_member(auth.uid(), tenant_id));

-- MCP Health Events
CREATE TABLE IF NOT EXISTS public.mcp_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_mcp_binding_id uuid NOT NULL REFERENCES public.tenant_mcp_bindings(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcp_health_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins view mcp health events" ON public.mcp_health_events FOR SELECT TO authenticated USING (has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role) OR is_system_admin(auth.uid()));
CREATE POLICY "System insert mcp health events" ON public.mcp_health_events FOR INSERT TO authenticated WITH CHECK (true);

-- Tenant Bootstrap Runs
CREATE TABLE IF NOT EXISTS public.tenant_bootstrap_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'bootstrap',
  status text NOT NULL DEFAULT 'started',
  request jsonb,
  result jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_bootstrap_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins manage bootstrap runs" ON public.tenant_bootstrap_runs FOR ALL TO authenticated USING (has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role) OR is_system_admin(auth.uid()));

-- Memory Items (v2)
CREATE TABLE IF NOT EXISTS public.memory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_ref text,
  memory_type text NOT NULL DEFAULT 'fact',
  memory_key text NOT NULL,
  content text NOT NULL,
  confidence real NOT NULL DEFAULT 0.6,
  importance integer NOT NULL DEFAULT 3,
  risk_level text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'active',
  source_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  valid_from timestamptz DEFAULT now(),
  valid_to timestamptz,
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins manage memory items" ON public.memory_items FOR ALL TO authenticated USING (has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role) OR is_system_admin(auth.uid()));
CREATE POLICY "Tenant members view memory items" ON public.memory_items FOR SELECT TO authenticated USING (is_tenant_member(auth.uid(), tenant_id));

-- Memory Access Logs
CREATE TABLE IF NOT EXISTS public.memory_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id text,
  user_ref text,
  memory_item_id uuid REFERENCES public.memory_items(id) ON DELETE SET NULL,
  action text NOT NULL DEFAULT 'recall',
  relevance_score real,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.memory_access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins view memory access logs" ON public.memory_access_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role) OR is_system_admin(auth.uid()));
CREATE POLICY "System insert memory access logs" ON public.memory_access_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Add updated_at triggers
CREATE TRIGGER update_skills_registry_updated_at BEFORE UPDATE ON public.skills_registry FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenant_skill_bindings_updated_at BEFORE UPDATE ON public.tenant_skill_bindings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mcp_servers_updated_at BEFORE UPDATE ON public.mcp_servers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenant_mcp_bindings_updated_at BEFORE UPDATE ON public.tenant_mcp_bindings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mcp_tool_policies_updated_at BEFORE UPDATE ON public.mcp_tool_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mcp_runtime_state_updated_at BEFORE UPDATE ON public.mcp_runtime_state FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_memory_items_updated_at BEFORE UPDATE ON public.memory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
