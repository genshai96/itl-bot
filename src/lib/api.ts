import { supabase } from "@/integrations/supabase/client";

// ==================== CHAT ====================
export async function sendChatMessage({
  tenantId,
  message,
  conversationId,
  endUser,
}: {
  tenantId: string;
  message: string;
  conversationId?: string;
  endUser?: { name?: string; email?: string; phone?: string };
}) {
  const { data, error } = await supabase.functions.invoke("chat", {
    body: {
      tenant_id: tenantId,
      message,
      conversation_id: conversationId,
      end_user: endUser,
    },
  });
  if (error) throw error;
  return data as {
    conversation_id: string;
    response: string;
    tool_used?: string;
    tool_latency_ms?: number;
  };
}

// ==================== MODELS ====================

export interface ModelInfo {
  id: string;
  name?: string;
  owned_by?: string;
}

export async function fetchProviderModels(endpoint: string, apiKey: string): Promise<ModelInfo[]> {
  const { data, error } = await supabase.functions.invoke("fetch-models", {
    body: { endpoint, api_key: apiKey },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.models || []) as ModelInfo[];
}
