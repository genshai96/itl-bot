
-- Allow system_admin without tenant
ALTER TABLE public.user_roles ALTER COLUMN tenant_id DROP NOT NULL;

-- Add FK so PostgREST can JOIN user_roles <-> profiles
ALTER TABLE public.user_roles 
  ADD CONSTRAINT user_roles_user_id_profiles_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Update has_role to handle nullable tenant_id
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _tenant_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id 
      AND (tenant_id = _tenant_id OR (tenant_id IS NULL AND _role = 'system_admin'))
      AND role = _role
  )
$$;

-- Auto-create tenant_admin role when creating a tenant (via trigger)
CREATE OR REPLACE FUNCTION public.auto_assign_tenant_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (auth.uid(), 'tenant_admin', NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_tenant_created
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_tenant_admin();
