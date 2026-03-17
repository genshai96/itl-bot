-- Seed / bootstrap scaffold for a fresh Supabase project
-- Project ref: xvnaowmwikookrkkgkcp
-- Purpose:
-- 1) Ensure required storage buckets exist
-- 2) Provide a safe starting point for seeding tenant/app data
--
-- Run after schema migrations are applied.

BEGIN;

-- Ensure required storage buckets exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('kb-documents', 'kb-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- Optional tenant bootstrap example
-- ------------------------------------------------------------
-- Replace the placeholder values below and uncomment if you want
-- a ready-to-test tenant immediately after migration.
--
-- WITH seeded_tenant AS (
--   INSERT INTO public.tenants (name, slug, status)
--   VALUES ('ITL Bot Demo', 'itl-bot-demo', 'active')
--   ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
--   RETURNING id
-- )
-- INSERT INTO public.tenant_configs (
--   tenant_id,
--   system_prompt,
--   pii_masking,
--   skills_runtime_enabled,
--   memory_v2_enabled,
--   prompt_injection_defense
-- )
-- SELECT
--   id,
--   'You are an AI support assistant. Be helpful, concise, and professional.',
--   false,
--   false,
--   false,
--   false
-- FROM seeded_tenant
-- ON CONFLICT (tenant_id) DO UPDATE SET
--   system_prompt = EXCLUDED.system_prompt,
--   pii_masking = EXCLUDED.pii_masking,
--   skills_runtime_enabled = EXCLUDED.skills_runtime_enabled,
--   memory_v2_enabled = EXCLUDED.memory_v2_enabled,
--   prompt_injection_defense = EXCLUDED.prompt_injection_defense;

COMMIT;
