-- ================================================
-- Widget User Roles: collect role + role options
-- ================================================

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS widget_collect_role BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS widget_role_options JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS end_user_role TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_role
  ON public.conversations (tenant_id, end_user_role);
