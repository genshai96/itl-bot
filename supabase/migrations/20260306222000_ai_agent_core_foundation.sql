-- ================================================
-- AI Agent Core Foundation (Memory v2 + Skills + MCP)
-- ================================================

-- ------------------------------
-- Tenant feature flags (phase-gated rollout)
-- ------------------------------
ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS memory_v2_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skills_runtime_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mcp_gateway_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS memory_decay_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS memory_min_confidence REAL NOT NULL DEFAULT 0.55;

-- ------------------------------
-- Memory v2
-- ------------------------------
CREATE TABLE IF NOT EXISTS public.memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_ref TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'fact' CHECK (memory_type IN ('profile', 'preference', 'fact', 'episodic', 'procedural', 'constraint')),
  memory_key TEXT,
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.6 CHECK (confidence >= 0 AND confidence <= 1),
  importance INTEGER NOT NULL DEFAULT 3 CHECK (importance >= 1 AND importance <= 5),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'expired', 'deleted')),
  source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_items_active_key
  ON public.memory_items (tenant_id, user_ref, memory_key)
  WHERE status = 'active' AND memory_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_items_lookup
  ON public.memory_items (tenant_id, user_ref, status, memory_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_items_expires
  ON public.memory_items (expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.memory_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_ref TEXT NOT NULL,
  summary_type TEXT NOT NULL DEFAULT 'rolling' CHECK (summary_type IN ('rolling', 'profile', 'episodic')),
  content TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_ref, summary_type)
);

ALTER TABLE public.memory_summaries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.memory_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_ref TEXT NOT NULL,
  memory_item_id UUID NOT NULL REFERENCES public.memory_items(id) ON DELETE CASCADE,
  conflicting_item_id UUID NOT NULL REFERENCES public.memory_items(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.memory_conflicts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_memory_conflicts_tenant_status
  ON public.memory_conflicts (tenant_id, user_ref, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.memory_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  user_ref TEXT NOT NULL,
  memory_item_id UUID REFERENCES public.memory_items(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('recall', 'write', 'update', 'expire', 'delete', 'conflict_detected')),
  score REAL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_access_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_memory_access_logs_tenant_time
  ON public.memory_access_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_access_logs_user
  ON public.memory_access_logs (tenant_id, user_ref, created_at DESC);

-- ------------------------------
-- Skills registry and tenant bindings
-- ------------------------------
CREATE TABLE IF NOT EXISTS public.skills_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT NOT NULL,
  category TEXT,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.skills_registry ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.tenant_skill_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  skill_registry_id UUID NOT NULL REFERENCES public.skills_registry(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'test' CHECK (status IN ('disabled', 'test', 'active')),
  pinned_version TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, skill_registry_id)
);

ALTER TABLE public.tenant_skill_bindings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tenant_skill_bindings_lookup
  ON public.tenant_skill_bindings (tenant_id, status, updated_at DESC);

-- ------------------------------
-- MCP registry and tenant governance bindings
-- ------------------------------
CREATE TABLE IF NOT EXISTS public.mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'http' CHECK (transport IN ('http', 'https', 'stdio', 'sse')),
  auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'oauth', 'bearer', 'header', 'basic')),
  healthcheck_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'degraded', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.tenant_mcp_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mcp_server_id UUID NOT NULL REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  timeout_ms INTEGER NOT NULL DEFAULT 15000,
  retry_max INTEGER NOT NULL DEFAULT 1,
  circuit_breaker_threshold INTEGER NOT NULL DEFAULT 5,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, mcp_server_id)
);

ALTER TABLE public.tenant_mcp_bindings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tenant_mcp_bindings_lookup
  ON public.tenant_mcp_bindings (tenant_id, enabled, priority);

CREATE TABLE IF NOT EXISTS public.mcp_tool_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_mcp_binding_id UUID REFERENCES public.tenant_mcp_bindings(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  required_roles app_role[] NOT NULL DEFAULT '{}'::app_role[],
  max_calls_per_minute INTEGER,
  pii_scope TEXT NOT NULL DEFAULT 'masked' CHECK (pii_scope IN ('none', 'masked', 'full')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tool_id)
);

ALTER TABLE public.mcp_tool_policies ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mcp_tool_policies_tenant
  ON public.mcp_tool_policies (tenant_id, enabled, tool_id);

-- ------------------------------
-- Updated_at triggers
-- ------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_memory_items_updated_at') THEN
    CREATE TRIGGER update_memory_items_updated_at
      BEFORE UPDATE ON public.memory_items
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_memory_summaries_updated_at') THEN
    CREATE TRIGGER update_memory_summaries_updated_at
      BEFORE UPDATE ON public.memory_summaries
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_skills_registry_updated_at') THEN
    CREATE TRIGGER update_skills_registry_updated_at
      BEFORE UPDATE ON public.skills_registry
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tenant_skill_bindings_updated_at') THEN
    CREATE TRIGGER update_tenant_skill_bindings_updated_at
      BEFORE UPDATE ON public.tenant_skill_bindings
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_mcp_servers_updated_at') THEN
    CREATE TRIGGER update_mcp_servers_updated_at
      BEFORE UPDATE ON public.mcp_servers
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tenant_mcp_bindings_updated_at') THEN
    CREATE TRIGGER update_tenant_mcp_bindings_updated_at
      BEFORE UPDATE ON public.tenant_mcp_bindings
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_mcp_tool_policies_updated_at') THEN
    CREATE TRIGGER update_mcp_tool_policies_updated_at
      BEFORE UPDATE ON public.mcp_tool_policies
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ------------------------------
-- RLS policies
-- ------------------------------
-- Memory tables
CREATE POLICY "Tenant members view memory items"
  ON public.memory_items FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins manage memory items"
  ON public.memory_items FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), tenant_id, 'tenant_admin')
    OR public.has_role(auth.uid(), tenant_id, 'support_lead')
    OR public.is_system_admin(auth.uid())
  );

CREATE POLICY "Tenant members view memory summaries"
  ON public.memory_summaries FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins manage memory summaries"
  ON public.memory_summaries FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), tenant_id, 'tenant_admin')
    OR public.has_role(auth.uid(), tenant_id, 'support_lead')
    OR public.is_system_admin(auth.uid())
  );

CREATE POLICY "Tenant members view memory conflicts"
  ON public.memory_conflicts FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins manage memory conflicts"
  ON public.memory_conflicts FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), tenant_id, 'tenant_admin')
    OR public.has_role(auth.uid(), tenant_id, 'support_lead')
    OR public.is_system_admin(auth.uid())
  );

CREATE POLICY "Tenant members view memory access logs"
  ON public.memory_access_logs FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "System insert memory access logs"
  ON public.memory_access_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Skills tables
CREATE POLICY "Authenticated read skills registry"
  ON public.skills_registry FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "System admins manage skills registry"
  ON public.skills_registry FOR ALL TO authenticated
  USING (public.is_system_admin(auth.uid()));

CREATE POLICY "Tenant members view skill bindings"
  ON public.tenant_skill_bindings FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins manage skill bindings"
  ON public.tenant_skill_bindings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'tenant_admin') OR public.is_system_admin(auth.uid()));

-- MCP tables
CREATE POLICY "Authenticated read mcp servers"
  ON public.mcp_servers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "System admins manage mcp servers"
  ON public.mcp_servers FOR ALL TO authenticated
  USING (public.is_system_admin(auth.uid()));

CREATE POLICY "Tenant members view mcp bindings"
  ON public.tenant_mcp_bindings FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins manage mcp bindings"
  ON public.tenant_mcp_bindings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'tenant_admin') OR public.is_system_admin(auth.uid()));

CREATE POLICY "Tenant members view mcp tool policies"
  ON public.mcp_tool_policies FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins manage mcp tool policies"
  ON public.mcp_tool_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'tenant_admin') OR public.is_system_admin(auth.uid()));
