ALTER TABLE public.tenant_configs
ADD COLUMN IF NOT EXISTS widget_collect_role boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS widget_role_options jsonb DEFAULT '[]'::jsonb;