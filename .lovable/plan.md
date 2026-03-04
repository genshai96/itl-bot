

## Problem Analysis

There are **3 critical issues** blocking the entire app:

1. **No `system_admin` role assigned** -- The logged-in user (`42705ffe-...`) has zero rows in `user_roles`. ALL RLS policies require role membership, so every query returns empty `[]` and every INSERT returns 403.

2. **No FK between `user_roles` and `profiles`** -- The Agents page tries `user_roles` JOIN `profiles!inner(...)` but PostgREST returns 400 because there's no foreign key linking them.

3. **Missing CRUD operations** -- Tenants page has Create but no Update/Delete. Agents page has no role assignment UI. KnowledgeBase has no delete. No test conversation flow exists.

## Plan

### Step 1: Database Migration -- Fix FK + Auto-assign first admin

**Migration SQL:**
- Add FK from `user_roles.user_id` to `profiles.user_id` so the JOIN works
- Insert `system_admin` role for the current user (`42705ffe-4378-4bb2-8005-43e76e9100b9`) with a dummy `tenant_id` (or make `tenant_id` nullable for system-level roles)

Actually, `tenant_id` is NOT NULL on `user_roles`, but `system_admin` is a global role. We need to either:
- Make `tenant_id` nullable for system-level roles, OR  
- Create an auto-assign mechanism

Best approach: Make `tenant_id` nullable for `system_admin` role, add FK to profiles, and insert the admin role.

```sql
-- Allow system_admin without tenant
ALTER TABLE public.user_roles ALTER COLUMN tenant_id DROP NOT NULL;

-- Add FK so PostgREST can JOIN user_roles <-> profiles
ALTER TABLE public.user_roles 
  ADD CONSTRAINT user_roles_user_id_profiles_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Assign system_admin to current user
INSERT INTO public.user_roles (user_id, role, tenant_id) 
VALUES ('42705ffe-4378-4bb2-8005-43e76e9100b9', 'system_admin', NULL)
ON CONFLICT DO NOTHING;
```

Also update RLS functions (`is_system_admin`, `is_tenant_member`, `has_role`) to handle nullable `tenant_id`.

### Step 2: Fix Agents page query

Update `Agents.tsx` query -- the FK will now work, but also handle the nullable tenant_id case. Change the select to properly join profiles.

### Step 3: Add full CRUD to Tenants

In `use-data.ts` add:
- `useUpdateTenant()` mutation  
- `useDeleteTenant()` mutation

In `Tenants.tsx`:
- Add edit dialog (rename, change domain, status)
- Add delete confirmation dialog

### Step 4: Add tenant deletion + update in TenantDetail

- "Delete tenant" button with confirmation
- Save tenant name/domain/status changes

### Step 5: Add KB document delete

In `KnowledgeBase.tsx`:
- Wire the existing Trash2 icon to actually delete the document + its chunks
- Add delete confirmation

### Step 6: Add Agent role management

In `Agents.tsx`:
- Add "Assign Role" dialog: select user (from profiles), select tenant, select role
- Add remove role button
- Show tenant name alongside role

### Step 7: Add test conversation trigger

In `TenantDetail.tsx` or `WidgetDemo.tsx`:
- Add a "Test Chat" section that lets admin send a test message to the chat edge function for the selected tenant
- Show the bot response inline

### Step 8: Auto-assign role on tenant creation

Update `useCreateTenant` to also insert a `tenant_admin` role for the current user after creating the tenant, so they can immediately manage it.

## Files to Change

| File | Changes |
|------|---------|
| Migration SQL | FK, nullable tenant_id, insert admin role |
| `src/hooks/use-data.ts` | Add `useUpdateTenant`, `useDeleteTenant`, `useDeleteKbDocument` |
| `src/pages/Tenants.tsx` | Add edit/delete dialogs |
| `src/pages/TenantDetail.tsx` | Add delete tenant, test chat section |
| `src/pages/Agents.tsx` | Fix query, add assign/remove role UI |
| `src/pages/KnowledgeBase.tsx` | Wire delete document |
| `src/pages/Conversations.tsx` | Minor -- already functional |

