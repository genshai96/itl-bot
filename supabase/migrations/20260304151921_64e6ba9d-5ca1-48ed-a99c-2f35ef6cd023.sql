
-- ================================================
-- AI Support Bot Multi-tenant Schema v1
-- ================================================

-- 1) App roles enum
CREATE TYPE public.app_role AS ENUM ('system_admin', 'tenant_admin', 'support_lead', 'support_agent', 'end_user');

-- 2) Tenants
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  domain TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'trial')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 3) Tenant Configs (AI provider, widget, security per tenant)
CREATE TABLE public.tenant_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  -- AI Provider
  provider_endpoint TEXT DEFAULT '',
  provider_api_key TEXT DEFAULT '',
  provider_model TEXT DEFAULT '',
  temperature REAL DEFAULT 0.3,
  max_tokens INT DEFAULT 2048,
  -- Widget
  widget_primary_color TEXT DEFAULT '#0d9488',
  widget_position TEXT DEFAULT 'bottom-right' CHECK (widget_position IN ('bottom-right', 'bottom-left')),
  widget_title TEXT DEFAULT 'AI Support',
  widget_subtitle TEXT DEFAULT '',
  widget_placeholder TEXT DEFAULT '',
  widget_welcome_message TEXT DEFAULT '',
  widget_collect_name BOOLEAN DEFAULT true,
  widget_collect_email BOOLEAN DEFAULT true,
  widget_collect_phone BOOLEAN DEFAULT false,
  widget_auto_open BOOLEAN DEFAULT false,
  widget_auto_open_delay INT DEFAULT 5,
  widget_show_powered_by BOOLEAN DEFAULT true,
  -- Security / Policy
  confidence_threshold REAL DEFAULT 0.6,
  max_tool_retries INT DEFAULT 2,
  pii_masking BOOLEAN DEFAULT true,
  prompt_injection_defense BOOLEAN DEFAULT true,
  -- System prompt
  system_prompt TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_configs ENABLE ROW LEVEL SECURITY;

-- 4) Profiles (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5) User Roles (multi-tenant)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 6) Conversations
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  end_user_name TEXT,
  end_user_email TEXT,
  end_user_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waiting', 'handoff', 'resolved', 'closed')),
  intent TEXT,
  confidence REAL,
  assigned_agent_id UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_conversations_tenant_status ON public.conversations(tenant_id, status, updated_at DESC);

-- 7) Messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'bot', 'agent', 'system')),
  content TEXT NOT NULL,
  confidence REAL,
  sources JSONB,
  tool_used TEXT,
  tool_latency_ms INT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);

-- 8) Conversation Labels
CREATE TABLE public.conversation_labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (label IN ('how_to_use', 'billing', 'sales', 'bug', 'feature_request', 'urgent', 'other')),
  auto_labeled BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_labels ENABLE ROW LEVEL SECURITY;

-- 9) KB Documents
CREATE TABLE public.kb_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'indexed', 'error')),
  chunk_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;

-- 10) KB Chunks (with vector embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.kb_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.kb_documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  chunk_index INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_kb_chunks_tenant ON public.kb_chunks(tenant_id);

-- 11) Tool Definitions
CREATE TABLE public.tool_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  endpoint TEXT NOT NULL,
  input_schema JSONB DEFAULT '{}',
  required_roles app_role[] DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, tool_id)
);

ALTER TABLE public.tool_definitions ENABLE ROW LEVEL SECURITY;

-- 12) Tool Call Logs
CREATE TABLE public.tool_call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  input JSONB,
  output JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  latency_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tool_call_logs ENABLE ROW LEVEL SECURITY;

-- 13) Handoff Events
CREATE TABLE public.handoff_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'normal')),
  assigned_to UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'resolved', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.handoff_events ENABLE ROW LEVEL SECURITY;

-- 14) Audit Logs
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'bot', 'system', 'agent')),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id, created_at DESC);

-- 15) Flow Definitions
CREATE TABLE public.flow_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.flow_definitions ENABLE ROW LEVEL SECURITY;

-- 16) Flow Versions
CREATE TABLE public.flow_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.flow_definitions(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(flow_id, version)
);

ALTER TABLE public.flow_versions ENABLE ROW LEVEL SECURITY;

-- ================================================
-- Security Definer Functions
-- ================================================

-- Check if user has role in tenant
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _tenant_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND role = _role
  )
$$;

-- Check if user is system admin
CREATE OR REPLACE FUNCTION public.is_system_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'system_admin'
  )
$$;

-- Check if user has any role in tenant (is member)
CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  )
$$;

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tenant_configs_updated_at BEFORE UPDATE ON public.tenant_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kb_documents_updated_at BEFORE UPDATE ON public.kb_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tool_definitions_updated_at BEFORE UPDATE ON public.tool_definitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_flow_definitions_updated_at BEFORE UPDATE ON public.flow_definitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================
-- RLS Policies
-- ================================================

-- Tenants: system admins see all, tenant members see own
CREATE POLICY "System admins can manage tenants" ON public.tenants FOR ALL TO authenticated USING (public.is_system_admin(auth.uid()));
CREATE POLICY "Tenant members can view their tenant" ON public.tenants FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), id));

-- Tenant Configs: tenant admins + system admins
CREATE POLICY "System admins manage configs" ON public.tenant_configs FOR ALL TO authenticated USING (public.is_system_admin(auth.uid()));
CREATE POLICY "Tenant admins manage own config" ON public.tenant_configs FOR ALL TO authenticated USING (public.has_role(auth.uid(), tenant_id, 'tenant_admin'));
CREATE POLICY "Tenant members view config" ON public.tenant_configs FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));

-- Profiles
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users manage own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = user_id);

-- User Roles
CREATE POLICY "System admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_system_admin(auth.uid()));
CREATE POLICY "Tenant admins manage roles in tenant" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), tenant_id, 'tenant_admin'));
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Conversations: tenant members see conversations in their tenant
CREATE POLICY "Tenant members view conversations" ON public.conversations FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Tenant members manage conversations" ON public.conversations FOR ALL TO authenticated USING (public.has_role(auth.uid(), tenant_id, 'support_agent') OR public.has_role(auth.uid(), tenant_id, 'support_lead') OR public.has_role(auth.uid(), tenant_id, 'tenant_admin') OR public.is_system_admin(auth.uid()));
-- Allow anonymous inserts for widget chat (end users)
CREATE POLICY "Anyone can create conversations" ON public.conversations FOR INSERT TO anon WITH CHECK (true);

-- Messages
CREATE POLICY "Tenant members view messages" ON public.messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND public.is_tenant_member(auth.uid(), c.tenant_id)));
CREATE POLICY "Anyone can insert messages" ON public.messages FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Authenticated insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (true);

-- Conversation Labels
CREATE POLICY "Tenant members manage labels" ON public.conversation_labels FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND public.is_tenant_member(auth.uid(), c.tenant_id)));

-- KB Documents
CREATE POLICY "Tenant members view KB" ON public.kb_documents FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Tenant admins manage KB" ON public.kb_documents FOR ALL TO authenticated USING (public.has_role(auth.uid(), tenant_id, 'tenant_admin') OR public.is_system_admin(auth.uid()));

-- KB Chunks
CREATE POLICY "Tenant members view chunks" ON public.kb_chunks FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Tenant admins manage chunks" ON public.kb_chunks FOR ALL TO authenticated USING (public.has_role(auth.uid(), tenant_id, 'tenant_admin') OR public.is_system_admin(auth.uid()));

-- Tool Definitions
CREATE POLICY "Tenant members view tools" ON public.tool_definitions FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Tenant admins manage tools" ON public.tool_definitions FOR ALL TO authenticated USING (public.has_role(auth.uid(), tenant_id, 'tenant_admin') OR public.is_system_admin(auth.uid()));

-- Tool Call Logs
CREATE POLICY "Tenant members view tool logs" ON public.tool_call_logs FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "System insert tool logs" ON public.tool_call_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Handoff Events
CREATE POLICY "Tenant members view handoffs" ON public.handoff_events FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Tenant agents manage handoffs" ON public.handoff_events FOR ALL TO authenticated USING (public.has_role(auth.uid(), tenant_id, 'support_agent') OR public.has_role(auth.uid(), tenant_id, 'support_lead') OR public.is_system_admin(auth.uid()));

-- Audit Logs
CREATE POLICY "Tenant admins view audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), tenant_id, 'tenant_admin') OR public.has_role(auth.uid(), tenant_id, 'support_lead') OR public.is_system_admin(auth.uid()));
CREATE POLICY "System insert audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon insert audit" ON public.audit_logs FOR INSERT TO anon WITH CHECK (true);

-- Flow Definitions
CREATE POLICY "Tenant members view flows" ON public.flow_definitions FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Tenant admins manage flows" ON public.flow_definitions FOR ALL TO authenticated USING (public.has_role(auth.uid(), tenant_id, 'tenant_admin') OR public.is_system_admin(auth.uid()));

-- Flow Versions
CREATE POLICY "Tenant members view flow versions" ON public.flow_versions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.flow_definitions f WHERE f.id = flow_id AND public.is_tenant_member(auth.uid(), f.tenant_id)));
CREATE POLICY "Tenant admins manage flow versions" ON public.flow_versions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.flow_definitions f WHERE f.id = flow_id AND (public.has_role(auth.uid(), f.tenant_id, 'tenant_admin') OR public.is_system_admin(auth.uid()))));

-- Storage bucket for KB documents
INSERT INTO storage.buckets (id, name, public) VALUES ('kb-documents', 'kb-documents', false);

CREATE POLICY "Tenant members upload KB docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'kb-documents');
CREATE POLICY "Tenant members view KB docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'kb-documents');
