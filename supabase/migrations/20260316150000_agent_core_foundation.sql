-- ================================================
-- Agent-Centric Core Foundation
-- ================================================

-- --------------------------------
-- Agents
-- --------------------------------
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  kind TEXT NOT NULL DEFAULT 'agent'
    CHECK (kind IN ('agent', 'assistant', 'copilot')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  public_name TEXT,
  avatar_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agents_tenant_status
  ON public.agents (tenant_id, status, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_agents_updated_at') THEN
    CREATE TRIGGER update_agents_updated_at
      BEFORE UPDATE ON public.agents
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DROP POLICY IF EXISTS "Tenant members view agents" ON public.agents;
CREATE POLICY "Tenant members view agents"
  ON public.agents FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Tenant admins manage agents" ON public.agents;
CREATE POLICY "Tenant admins manage agents"
  ON public.agents FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), tenant_id, 'tenant_admin')
    OR public.has_role(auth.uid(), tenant_id, 'support_lead')
    OR public.is_system_admin(auth.uid())
  );

-- --------------------------------
-- Agent configs
-- --------------------------------
CREATE TABLE IF NOT EXISTS public.agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  provider_endpoint TEXT DEFAULT '',
  provider_api_key TEXT DEFAULT '',
  provider_model TEXT DEFAULT '',
  temperature REAL DEFAULT 0.3,
  max_tokens INT DEFAULT 2048,
  system_prompt TEXT DEFAULT '',
  prompt_version TEXT,
  memory_mode TEXT NOT NULL DEFAULT 'legacy'
    CHECK (memory_mode IN ('disabled', 'legacy', 'openviking', 'hybrid')),
  openviking_enabled BOOLEAN NOT NULL DEFAULT false,
  openviking_read_only BOOLEAN NOT NULL DEFAULT true,
  memory_v2_enabled BOOLEAN NOT NULL DEFAULT false,
  memory_decay_days INTEGER NOT NULL DEFAULT 30,
  memory_min_confidence REAL NOT NULL DEFAULT 0.55,
  skills_enabled BOOLEAN NOT NULL DEFAULT true,
  flow_enabled BOOLEAN NOT NULL DEFAULT true,
  mcp_gateway_enabled BOOLEAN NOT NULL DEFAULT false,
  pii_masking BOOLEAN NOT NULL DEFAULT true,
  prompt_injection_defense BOOLEAN NOT NULL DEFAULT true,
  confidence_threshold REAL DEFAULT 0.6,
  max_tool_retries INT DEFAULT 2,
  widget_primary_color TEXT DEFAULT '#0d9488',
  widget_position TEXT DEFAULT 'bottom-right'
    CHECK (widget_position IN ('bottom-right', 'bottom-left')),
  widget_title TEXT DEFAULT '',
  widget_subtitle TEXT DEFAULT '',
  widget_placeholder TEXT DEFAULT '',
  widget_welcome_message TEXT DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_configs_active
  ON public.agent_configs (agent_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_agent_configs_agent_status
  ON public.agent_configs (agent_id, status, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_agent_configs_updated_at') THEN
    CREATE TRIGGER update_agent_configs_updated_at
      BEFORE UPDATE ON public.agent_configs
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DROP POLICY IF EXISTS "Tenant members view agent configs" ON public.agent_configs;
CREATE POLICY "Tenant members view agent configs"
  ON public.agent_configs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_id
        AND public.is_tenant_member(auth.uid(), a.tenant_id)
    )
  );

DROP POLICY IF EXISTS "Tenant admins manage agent configs" ON public.agent_configs;
CREATE POLICY "Tenant admins manage agent configs"
  ON public.agent_configs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_id
        AND (
          public.has_role(auth.uid(), a.tenant_id, 'tenant_admin')
          OR public.has_role(auth.uid(), a.tenant_id, 'support_lead')
          OR public.is_system_admin(auth.uid())
        )
    )
  );

-- --------------------------------
-- Agent skill bindings
-- --------------------------------
CREATE TABLE IF NOT EXISTS public.agent_skill_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  skill_registry_id UUID NOT NULL REFERENCES public.skills_registry(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('disabled', 'test', 'active')),
  priority INTEGER NOT NULL DEFAULT 100,
  pinned_version TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, skill_registry_id)
);

ALTER TABLE public.agent_skill_bindings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agent_skill_bindings_lookup
  ON public.agent_skill_bindings (agent_id, status, priority, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_agent_skill_bindings_updated_at') THEN
    CREATE TRIGGER update_agent_skill_bindings_updated_at
      BEFORE UPDATE ON public.agent_skill_bindings
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DROP POLICY IF EXISTS "Tenant members view agent skill bindings" ON public.agent_skill_bindings;
CREATE POLICY "Tenant members view agent skill bindings"
  ON public.agent_skill_bindings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_id
        AND public.is_tenant_member(auth.uid(), a.tenant_id)
    )
  );

DROP POLICY IF EXISTS "Tenant admins manage agent skill bindings" ON public.agent_skill_bindings;
CREATE POLICY "Tenant admins manage agent skill bindings"
  ON public.agent_skill_bindings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_id
        AND (
          public.has_role(auth.uid(), a.tenant_id, 'tenant_admin')
          OR public.has_role(auth.uid(), a.tenant_id, 'support_lead')
          OR public.is_system_admin(auth.uid())
        )
    )
  );

-- --------------------------------
-- Agent flow bindings
-- --------------------------------
CREATE TABLE IF NOT EXISTS public.agent_flow_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES public.flow_definitions(id) ON DELETE CASCADE,
  flow_version_id UUID REFERENCES public.flow_versions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('disabled', 'test', 'active')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  mode TEXT NOT NULL DEFAULT 'primary'
    CHECK (mode IN ('primary', 'fallback', 'shadow')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_flow_bindings ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_primary_flow_active
  ON public.agent_flow_bindings (agent_id)
  WHERE is_active = true AND mode = 'primary';

CREATE INDEX IF NOT EXISTS idx_agent_flow_bindings_lookup
  ON public.agent_flow_bindings (agent_id, status, is_active, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_agent_flow_bindings_updated_at') THEN
    CREATE TRIGGER update_agent_flow_bindings_updated_at
      BEFORE UPDATE ON public.agent_flow_bindings
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DROP POLICY IF EXISTS "Tenant members view agent flow bindings" ON public.agent_flow_bindings;
CREATE POLICY "Tenant members view agent flow bindings"
  ON public.agent_flow_bindings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_id
        AND public.is_tenant_member(auth.uid(), a.tenant_id)
    )
  );

DROP POLICY IF EXISTS "Tenant admins manage agent flow bindings" ON public.agent_flow_bindings;
CREATE POLICY "Tenant admins manage agent flow bindings"
  ON public.agent_flow_bindings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_id
        AND (
          public.has_role(auth.uid(), a.tenant_id, 'tenant_admin')
          OR public.has_role(auth.uid(), a.tenant_id, 'support_lead')
          OR public.is_system_admin(auth.uid())
        )
    )
  );

-- --------------------------------
-- Link runtime/memory tables to agents
-- --------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_agent
  ON public.conversations (agent_id, updated_at DESC);

ALTER TABLE public.memory_items
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_memory_items_agent_lookup
  ON public.memory_items (agent_id, user_ref, updated_at DESC);

ALTER TABLE public.agfs_nodes
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_agfs_nodes_agent_lookup
  ON public.agfs_nodes (agent_id, account_id, path);

ALTER TABLE public.viking_vectors
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_viking_vectors_agent_lookup
  ON public.viking_vectors (agent_id, account_id, created_at DESC);
