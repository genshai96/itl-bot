import { supabase } from "@/integrations/supabase/client";

// Chat API — used by embedded widget
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

// Widget config API
export async function getWidgetConfig(slug: string) {
  const { data, error } = await supabase.functions.invoke("widget-config", {
    body: {},
    headers: {},
  });
  
  // Use fetch directly since we need query params
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/widget-config?slug=${encodeURIComponent(slug)}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
  });
  
  if (!resp.ok) throw new Error("Failed to get widget config");
  return resp.json();
}
