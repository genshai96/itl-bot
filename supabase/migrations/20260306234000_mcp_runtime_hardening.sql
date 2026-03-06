-- ================================================
-- MCP Runtime Hardening (state + health telemetry)
-- ================================================

CREATE TABLE IF NOT EXISTS public.mcp_runtime_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_mcp_binding_id UUID NOT NULL REFERENCES public.tenant_mcp_bindings(id) ON DELETE CASCADE,
  failure_count INTEGER NOT NULL DEFAULT 0,
  circuit_state TEXT NOT NULL DEFAULT 'closed' CHECK (circuit_state IN ('closed', 'open', 'half_open')),
  circuit_open_until TIMESTAMPTZ,
  last_error TEXT,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_healthcheck_at TIMESTAMPTZ,
  last_health_status TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tenant_mcp_binding_id)
);

ALTER TABLE public.mcp_runtime_state ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mcp_runtime_state_tenant
  ON public.mcp_runtime_state (tenant_id, circuit_state, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.mcp_health_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_mcp_binding_id UUID REFERENCES public.tenant_mcp_bindings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('healthcheck_ok', 'healthcheck_fail', 'invoke_ok', 'invoke_fail', 'circuit_opened', 'circuit_reset')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_health_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mcp_health_events_tenant
  ON public.mcp_health_events (tenant_id, created_at DESC);

-- updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_mcp_runtime_state_updated_at') THEN
    CREATE TRIGGER update_mcp_runtime_state_updated_at
      BEFORE UPDATE ON public.mcp_runtime_state
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- RLS policies
CREATE POLICY "Tenant members view mcp runtime state"
  ON public.mcp_runtime_state FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins manage mcp runtime state"
  ON public.mcp_runtime_state FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'tenant_admin') OR public.is_system_admin(auth.uid()));

CREATE POLICY "Tenant members view mcp health events"
  ON public.mcp_health_events FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "System insert mcp health events"
  ON public.mcp_health_events FOR INSERT TO authenticated
  WITH CHECK (true);
