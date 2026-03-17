import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-telegram-bot-api-secret-token",
};

export type ChannelType = "telegram" | "zalo" | "whatsapp";

export function getServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceKey);
}

export function getInternalInvokeHeaders() {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return {
    "Content-Type": "application/json",
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
  };
}

export async function resolveChannelBinding(
  supabase: any,
  type: ChannelType,
  matcher: (binding: any) => boolean,
): Promise<any | null> {
  const { data, error } = await supabase
    .from("agent_channel_bindings" as any)
    .select("id, agent_id, enabled, status, config, routing")
    .eq("channel_type", type)
    .eq("enabled", true);

  if (error) throw error;
  return (data || []).find(matcher) || null;
}

export async function getAgentTenant(supabase: any, agentId: string): Promise<{ id: string; tenant_id: string; is_default: boolean } | null> {
  const { data, error } = await supabase
    .from("agents" as any)
    .select("id, tenant_id, is_default")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function findOrCreateChannelConversation(
  supabase: any,
  params: {
    tenantId: string;
    agentId: string;
    channelType: ChannelType;
    peerKey: string;
    channelMetadata: Record<string, any>;
    endUser?: { name?: string | null; email?: string | null; phone?: string | null; role?: string | null };
  },
): Promise<{ id: string; metadata: Record<string, any> }> {
  const { tenantId, agentId, channelType, peerKey, channelMetadata, endUser } = params;

  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id, metadata")
    .eq("tenant_id", tenantId)
    .contains("metadata", { channel: { type: channelType, peer_key: peerKey } })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return { id: existing.id, metadata: existing.metadata || {} };

  const payload: Record<string, any> = {
    tenant_id: tenantId,
    agent_id: agentId,
    end_user_name: endUser?.name || null,
    end_user_email: endUser?.email || null,
    end_user_phone: endUser?.phone || null,
    status: "active",
    metadata: {
      channel: {
        type: channelType,
        peer_key: peerKey,
        ...channelMetadata,
      },
    },
  };

  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert(payload)
    .select("id, metadata")
    .single();

  if (createError) throw createError;
  return { id: created.id, metadata: created.metadata || {} };
}

export async function invokeChatRuntime(params: {
  tenantId: string;
  agentId?: string;
  conversationId: string;
  message: string;
  endUser?: { name?: string | null; email?: string | null; phone?: string | null; role?: string | null };
  channelContext?: Record<string, any>;
}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const response = await fetch(`${supabaseUrl}/functions/v1/chat`, {
    method: "POST",
    headers: getInternalInvokeHeaders(),
    body: JSON.stringify({
      tenant_id: params.tenantId,
      agent_id: params.agentId || null,
      conversation_id: params.conversationId,
      message: params.message,
      end_user: params.endUser,
      channel_context: params.channelContext || {},
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Chat invoke failed: ${response.status}`);
  }
  return data;
}

export async function sendTelegramMessage(binding: any, chatId: string | number, text: string) {
  const token = binding?.config?.botToken;
  if (!token || !chatId || !text) return;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function sendZaloMessage(binding: any, userId: string, text: string) {
  const accessToken = binding?.config?.accessToken || binding?.config?.appSecret;
  const apiBaseUrl = binding?.config?.apiBaseUrl || "https://openapi.zalo.me/v3.0/oa/message/cs";
  if (!accessToken || !userId || !text) return;

  await fetch(apiBaseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "access_token": accessToken,
    },
    body: JSON.stringify({
      recipient: { user_id: userId },
      message: { text },
    }),
  });
}

export async function sendWhatsAppMessage(binding: any, to: string, text: string) {
  const phoneNumberId = binding?.config?.phoneNumberId;
  const accessToken = binding?.config?.accessToken;
  const apiVersion = binding?.config?.apiVersion || "v23.0";
  if (!phoneNumberId || !accessToken || !to || !text) return;

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
}

export function telegramTextFromUpdate(update: any): { text: string; chatId: string; fromId: string; name: string; username?: string; isGroup: boolean } | null {
  const message = update?.message || update?.edited_message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id;
  const fromId = message?.from?.id;
  if (!text || !chatId || !fromId) return null;

  const firstName = message?.from?.first_name || "";
  const lastName = message?.from?.last_name || "";
  const name = `${firstName} ${lastName}`.trim() || message?.from?.username || `tg:${fromId}`;
  const username = message?.from?.username || undefined;
  const isGroup = ["group", "supergroup"].includes(message?.chat?.type || "");
  return { text, chatId: String(chatId), fromId: String(fromId), name, username, isGroup };
}

export function whatsappTextFromWebhook(body: any): { text: string; from: string; phoneNumberId?: string; profileName?: string } | null {
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];
  const text = message?.text?.body?.trim();
  const from = message?.from;
  if (!text || !from) return null;

  const contact = value?.contacts?.[0];
  const phoneNumberId = value?.metadata?.phone_number_id;
  return {
    text,
    from: String(from),
    phoneNumberId: phoneNumberId ? String(phoneNumberId) : undefined,
    profileName: contact?.profile?.name || null,
  };
}

export function zaloTextFromWebhook(body: any): { text: string; userId: string; oaId?: string; displayName?: string } | null {
  const eventName = body?.event_name || body?.eventName;
  const message = body?.message || body?.data?.message || {};
  const sender = body?.sender || body?.data?.sender || {};
  const text = message?.text?.trim() || body?.message?.text?.trim() || body?.content?.trim();
  const userId = sender?.id || sender?.user_id || body?.user_id;
  const oaId = body?.oa_id || body?.oaId || body?.app_id || body?.appId;
  if (!text || !userId) return null;
  if (eventName && !String(eventName).includes("user_send")) {
    return null;
  }
  return {
    text: String(text),
    userId: String(userId),
    oaId: oaId ? String(oaId) : undefined,
    displayName: sender?.display_name || sender?.name || null,
  };
}
