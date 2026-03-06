-- ================================================
-- Tenant Bootstrap Automation (Phase 6)
-- ================================================

CREATE TABLE IF NOT EXISTS public.tenant_bootstrap_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('validate', 'bootstrap')),
  status TEXT NOT NULL CHECK (status IN ('started', 'validated', 'completed', 'failed', 'rolled_back')),
  request JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_bootstrap_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tenant_bootstrap_runs_tenant
  ON public.tenant_bootstrap_runs (tenant_id, created_at DESC);

CREATE POLICY "Tenant members view bootstrap runs"
  ON public.tenant_bootstrap_runs FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins manage bootstrap runs"
  ON public.tenant_bootstrap_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'tenant_admin') OR public.is_system_admin(auth.uid()));
