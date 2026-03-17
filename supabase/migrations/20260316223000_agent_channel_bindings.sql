-- ================================================
-- Agent Channel Bindings
-- ================================================

CREATE TABLE IF NOT EXISTS public.agent_channel_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL
    CHECK (channel_type IN ('widget', 'telegram', 'zalo', 'whatsapp')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'configured', 'active', 'error', 'disabled')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  routing JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, channel_type)
);

ALTER TABLE public.agent_channel_bindings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agent_channel_bindings_lookup
  ON public.agent_channel_bindings (agent_id, channel_type, enabled, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_agent_channel_bindings_updated_at') THEN
    CREATE TRIGGER update_agent_channel_bindings_updated_at
      BEFORE UPDATE ON public.agent_channel_bindings
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DROP POLICY IF EXISTS "Tenant members view agent channel bindings" ON public.agent_channel_bindings;
CREATE POLICY "Tenant members view agent channel bindings"
  ON public.agent_channel_bindings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_id
        AND public.is_tenant_member(auth.uid(), a.tenant_id)
    )
  );

DROP POLICY IF EXISTS "Tenant admins manage agent channel bindings" ON public.agent_channel_bindings;
CREATE POLICY "Tenant admins manage agent channel bindings"
  ON public.agent_channel_bindings FOR ALL TO authenticated
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
