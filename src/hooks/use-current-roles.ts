import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type UserRoleType = "system_admin" | "tenant_admin" | "support_lead" | "support_agent" | "end_user";

export function useCurrentUserRoles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["current-user-roles", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data as { role: UserRoleType; tenant_id: string | null }[];
    },
  });
}

export function useHighestRole(): UserRoleType | null {
  const { data: roles } = useCurrentUserRoles();
  if (!roles || roles.length === 0) return null;
  const priority: UserRoleType[] = ["system_admin", "tenant_admin", "support_lead", "support_agent", "end_user"];
  for (const p of priority) {
    if (roles.some((r) => r.role === p)) return p;
  }
  return null;
}
