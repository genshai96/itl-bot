-- ================================================
-- OpenViking Memory Layer
-- ================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- --------------------------------
-- Helper: resolve account context
-- Falls back to auth.uid() when no app.account_id is set.
-- --------------------------------
CREATE OR REPLACE FUNCTION public.current_app_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.account_id', true), '')::uuid,
    auth.uid()
  )
$$;

-- --------------------------------
-- API keys for future account-scoped access
-- --------------------------------
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,
  account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_api_keys_account_id
  ON public.api_keys (account_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_api_keys_updated_at') THEN
    CREATE TRIGGER update_api_keys_updated_at
      BEFORE UPDATE ON public.api_keys
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DROP POLICY IF EXISTS "Owners view api keys" ON public.api_keys;
CREATE POLICY "Owners view api keys"
  ON public.api_keys FOR SELECT TO authenticated
  USING (account_id = public.current_app_account_id() OR public.is_system_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners manage api keys" ON public.api_keys;
CREATE POLICY "Owners manage api keys"
  ON public.api_keys FOR ALL TO authenticated
  USING (account_id = public.current_app_account_id() OR public.is_system_admin(auth.uid()))
  WITH CHECK (account_id = public.current_app_account_id() OR public.is_system_admin(auth.uid()));

-- --------------------------------
-- AGFS nodes: path-based OpenViking storage
-- --------------------------------
CREATE TABLE IF NOT EXISTS public.agfs_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  parent_path TEXT,
  node_type TEXT NOT NULL DEFAULT 'document' CHECK (node_type IN ('folder', 'document', 'memory', 'skill', 'resource')),
  level INTEGER,
  title TEXT,
  content TEXT,
  content_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, path)
);

ALTER TABLE public.agfs_nodes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agfs_nodes_account_path
  ON public.agfs_nodes (account_id, path);

CREATE INDEX IF NOT EXISTS idx_agfs_nodes_account_parent
  ON public.agfs_nodes (account_id, parent_path);

CREATE INDEX IF NOT EXISTS idx_agfs_nodes_tenant
  ON public.agfs_nodes (tenant_id, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_agfs_nodes_updated_at') THEN
    CREATE TRIGGER update_agfs_nodes_updated_at
      BEFORE UPDATE ON public.agfs_nodes
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DROP POLICY IF EXISTS "Owners view agfs nodes" ON public.agfs_nodes;
CREATE POLICY "Owners view agfs nodes"
  ON public.agfs_nodes FOR SELECT TO authenticated
  USING (account_id = public.current_app_account_id() OR public.is_system_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners manage agfs nodes" ON public.agfs_nodes;
CREATE POLICY "Owners manage agfs nodes"
  ON public.agfs_nodes FOR ALL TO authenticated
  USING (account_id = public.current_app_account_id() OR public.is_system_admin(auth.uid()))
  WITH CHECK (account_id = public.current_app_account_id() OR public.is_system_admin(auth.uid()));

-- --------------------------------
-- Vector storage for semantic memory search
-- --------------------------------
CREATE TABLE IF NOT EXISTS public.viking_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  node_id UUID REFERENCES public.agfs_nodes(id) ON DELETE CASCADE,
  embedding vector(1536),
  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.viking_vectors ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_viking_vectors_account_node
  ON public.viking_vectors (account_id, node_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_viking_vectors_tenant
  ON public.viking_vectors (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_viking_vectors_embedding
  ON public.viking_vectors USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_viking_vectors_updated_at') THEN
    CREATE TRIGGER update_viking_vectors_updated_at
      BEFORE UPDATE ON public.viking_vectors
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DROP POLICY IF EXISTS "Owners view viking vectors" ON public.viking_vectors;
CREATE POLICY "Owners view viking vectors"
  ON public.viking_vectors FOR SELECT TO authenticated
  USING (account_id = public.current_app_account_id() OR public.is_system_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners manage viking vectors" ON public.viking_vectors;
CREATE POLICY "Owners manage viking vectors"
  ON public.viking_vectors FOR ALL TO authenticated
  USING (account_id = public.current_app_account_id() OR public.is_system_admin(auth.uid()))
  WITH CHECK (account_id = public.current_app_account_id() OR public.is_system_admin(auth.uid()));

-- --------------------------------
-- RPC helper for vector search
-- --------------------------------
CREATE OR REPLACE FUNCTION public.match_viking_vectors(
  query_embedding vector(1536),
  match_count integer DEFAULT 5,
  filter_tenant_id uuid DEFAULT NULL,
  filter_account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  node_id uuid,
  account_id uuid,
  tenant_id uuid,
  content text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    vv.id,
    vv.node_id,
    vv.account_id,
    vv.tenant_id,
    vv.content,
    vv.metadata,
    1 - (vv.embedding <=> query_embedding) AS similarity
  FROM public.viking_vectors vv
  WHERE vv.account_id = COALESCE(filter_account_id, public.current_app_account_id())
    AND (filter_tenant_id IS NULL OR vv.tenant_id = filter_tenant_id)
    AND vv.embedding IS NOT NULL
  ORDER BY vv.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1)
$$;

GRANT EXECUTE ON FUNCTION public.match_viking_vectors(vector, integer, uuid, uuid) TO authenticated;
