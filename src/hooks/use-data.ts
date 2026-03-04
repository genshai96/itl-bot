import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
type TenantInsert = Database["public"]["Tables"]["tenants"]["Insert"];
type TenantConfig = Database["public"]["Tables"]["tenant_configs"]["Row"];
type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
type Message = Database["public"]["Tables"]["messages"]["Row"];

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
        .limit(20);
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
        .limit(20);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
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
        .select("*, profiles(display_name, user_id)")
        .order("created_at", { ascending: false });
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
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
