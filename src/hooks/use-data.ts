import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
type TenantInsert = Database["public"]["Tables"]["tenants"]["Insert"];
type TenantConfig = Database["public"]["Tables"]["tenant_configs"]["Row"];
type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
type Message = Database["public"]["Tables"]["messages"]["Row"];

// Explicitly exported for use in HandoffQueue and sub-components
export type HandoffEvent = Database["public"]["Tables"]["handoff_events"]["Row"];

// Shared role type — mirrors the app_role DB enum
export type AppRole = Database["public"]["Enums"]["app_role"];

// UserRole row with joined profile
export type UserRoleWithProfile = Database["public"]["Tables"]["user_roles"]["Row"] & {
  profiles: Pick<
    Database["public"]["Tables"]["profiles"]["Row"],
    "display_name" | "user_id" | "avatar_url"
  > | null;
};

// ==================== TENANTS ====================
export function useTenants() {
  return useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Tenant[];
    },
  });
}

export function useTenant(id: string) {
  return useQuery({
    queryKey: ["tenants", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Tenant;
    },
    enabled: !!id,
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenant: TenantInsert) => {
      const { data, error } = await supabase
        .from("tenants")
        .insert(tenant)
        .select()
        .single();
      if (error) throw error;
      // Also create default config
      await supabase.from("tenant_configs").insert({ tenant_id: data.id });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Tenant> }) => {
      const { data, error } = await supabase
        .from("tenants")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["tenants", vars.id] });
    },
  });
}

export function useDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

// ==================== TENANT CONFIGS ====================
export function useTenantConfig(tenantId: string) {
  return useQuery({
    queryKey: ["tenant_configs", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_configs")
        .select("*")
        .eq("tenant_id", tenantId)
        .single();
      if (error) throw error;
      return data as TenantConfig;
    },
    enabled: !!tenantId,
  });
}

export function useUpdateTenantConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantId, config }: { tenantId: string; config: Partial<TenantConfig> }) => {
      const { data, error } = await supabase
        .from("tenant_configs")
        .update(config)
        .eq("tenant_id", tenantId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["tenant_configs", vars.tenantId] }),
  });
}

// ==================== CONVERSATIONS ====================
export function useConversations(tenantId?: string) {
  return useQuery({
    queryKey: ["conversations", tenantId],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return data as Conversation[];
    },
  });
}

// ==================== MESSAGES ====================
export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!conversationId,
  });
}

// ==================== KB DOCUMENTS ====================
export function useKbDocuments(tenantId: string) {
  return useQuery({
    queryKey: ["kb_documents", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kb_documents")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });
}

export function useDeleteKbDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, tenantId }: { docId: string; tenantId: string }) => {
      // Delete chunks first, then document
      await supabase.from("kb_chunks").delete().eq("document_id", docId);
      const { error } = await supabase.from("kb_documents").delete().eq("id", docId);
      if (error) throw error;
      return tenantId;
    },
    onSuccess: (tenantId) => qc.invalidateQueries({ queryKey: ["kb_documents", tenantId] }),
  });
}

// ==================== TOOL DEFINITIONS ====================
export function useToolDefinitions(tenantId: string) {
  return useQuery({
    queryKey: ["tool_definitions", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tool_definitions")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });
}

export function useCreateToolDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tool: {
      tenant_id: string;
      name: string;
      tool_id: string;
      description: string;
      endpoint: string;
      input_schema?: any;
      enabled?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("tool_definitions")
        .insert(tool)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ["tool_definitions", data.tenant_id] }),
  });
}

export function useUpdateToolDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { data, error } = await supabase
        .from("tool_definitions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ["tool_definitions", data.tenant_id] }),
  });
}

export function useDeleteToolDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
      const { error } = await supabase.from("tool_definitions").delete().eq("id", id);
      if (error) throw error;
      return tenantId;
    },
    onSuccess: (tenantId) => qc.invalidateQueries({ queryKey: ["tool_definitions", tenantId] }),
  });
}

// ==================== ANALYTICS ====================
export function useConversationStats(tenantId?: string) {
  return useQuery({
    queryKey: ["conversation_stats", tenantId],
    queryFn: async () => {
      let query = supabase.from("conversations").select("status, intent, confidence", { count: "exact" });
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error, count } = await query;
      if (error) throw error;
      return { conversations: data, total: count };
    },
  });
}

export function useToolCallLogs(tenantId?: string) {
  return useQuery({
    queryKey: ["tool_call_logs", tenantId],
    queryFn: async () => {
      let query = supabase
        .from("tool_call_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useHandoffEvents(tenantId?: string) {
  return useQuery({
    queryKey: ["handoff_events", tenantId],
    queryFn: async () => {
      let query = supabase
        .from("handoff_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as HandoffEvent[];
    },
  });
}

// ==================== USER ROLES ====================
export function useUserRoles(tenantId?: string) {
  return useQuery({
    queryKey: ["user_roles", tenantId],
    queryFn: async () => {
      let query = supabase
        .from("user_roles")
        .select("*, profiles(display_name, user_id, avatar_url)")
        .order("created_at", { ascending: false });
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as UserRoleWithProfile[];
    },
  });
}

export function useCreateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (role: { user_id: string; role: string; tenant_id: string | null }) => {
      const { data, error } = await supabase
        .from("user_roles")
        .insert(role as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user_roles"] }),
  });
}

export function useDeleteUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user_roles"] }),
  });
}

// ==================== PROFILES ====================
export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
