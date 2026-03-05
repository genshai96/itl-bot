
-- Vector similarity search function for RAG
CREATE OR REPLACE FUNCTION public.match_kb_chunks(
  _tenant_id uuid,
  _query_embedding vector(1536),
  _match_threshold float DEFAULT 0.7,
  _match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  content text,
  chunk_index int,
  document_id uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    kb_chunks.id,
    kb_chunks.content,
    kb_chunks.chunk_index,
    kb_chunks.document_id,
    1 - (kb_chunks.embedding <=> _query_embedding) as similarity
  FROM kb_chunks
  WHERE kb_chunks.tenant_id = _tenant_id
    AND kb_chunks.embedding IS NOT NULL
    AND 1 - (kb_chunks.embedding <=> _query_embedding) > _match_threshold
  ORDER BY kb_chunks.embedding <=> _query_embedding
  LIMIT _match_count;
$$;

-- Create HNSW index on embeddings for fast similarity search
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx ON public.kb_chunks 
USING hnsw (embedding vector_cosine_ops);

-- Add webhook_url and notification_email to tenant_configs for notifications
ALTER TABLE public.tenant_configs 
ADD COLUMN IF NOT EXISTS webhook_url text DEFAULT '',
ADD COLUMN IF NOT EXISTS notification_email text DEFAULT '',
ADD COLUMN IF NOT EXISTS api_key text DEFAULT '';
