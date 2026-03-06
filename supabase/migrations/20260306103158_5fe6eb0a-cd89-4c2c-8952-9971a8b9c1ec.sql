
-- Bot memory table for rules, corrections, facts, personality, skills per tenant
CREATE TABLE public.bot_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'rule', -- rule, correction, fact, personality, skill, constraint
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.bot_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins manage bot memory"
ON public.bot_memory FOR ALL TO authenticated
USING (
  has_role(auth.uid(), tenant_id, 'tenant_admin'::app_role)
  OR has_role(auth.uid(), tenant_id, 'support_lead'::app_role)
  OR is_system_admin(auth.uid())
);

CREATE POLICY "Tenant members view bot memory"
ON public.bot_memory FOR SELECT TO authenticated
USING (is_tenant_member(auth.uid(), tenant_id));

-- Updated_at trigger
CREATE TRIGGER update_bot_memory_updated_at
  BEFORE UPDATE ON public.bot_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_bot_memory_tenant_category ON public.bot_memory(tenant_id, category);
CREATE INDEX idx_bot_memory_enabled ON public.bot_memory(tenant_id, enabled) WHERE enabled = true;
