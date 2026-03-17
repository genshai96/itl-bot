import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  findOrCreateChannelConversation,
  getAgentTenant,
  getServiceClient,
  invokeChatRuntime,
  resolveChannelBinding,
  sendWhatsAppMessage,
  whatsappTextFromWebhook,
} from "../_shared/channel-runtime.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token") || "";
      const challenge = url.searchParams.get("hub.challenge") || "";

      if (mode !== "subscribe") {
        return new Response("Invalid mode", { status: 400, headers: corsHeaders });
      }

      const supabase = getServiceClient();
      const binding = await resolveChannelBinding(supabase, "whatsapp", (row: any) => {
        const config = row.config || {};
        return !!token && config.webhookVerifyToken === token;
      });

      if (!binding) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }

      return new Response(challenge, { headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }

    const body = await req.json();
    const inbound = whatsappTextFromWebhook(body);
    if (!inbound) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_text_message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getServiceClient();
    const binding = await resolveChannelBinding(supabase, "whatsapp", (row: any) => {
      const config = row.config || {};
      return !inbound.phoneNumberId || !config.phoneNumberId || String(config.phoneNumberId) === String(inbound.phoneNumberId);
    });

    if (!binding) {
      return new Response(JSON.stringify({ error: "No enabled WhatsApp binding matched this webhook" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const agent = await getAgentTenant(supabase, binding.agent_id);
    if (!agent?.tenant_id) {
      return new Response(JSON.stringify({ error: "Binding agent not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const peerKey = `whatsapp:${inbound.from}`;
    const conversation = await findOrCreateChannelConversation(supabase, {
      tenantId: agent.tenant_id,
      agentId: binding.agent_id,
      channelType: "whatsapp",
      peerKey,
      channelMetadata: {
        wa_id: inbound.from,
        phone_number_id: inbound.phoneNumberId || null,
      },
      endUser: {
        name: inbound.profileName || `wa:${inbound.from}`,
        phone: inbound.from,
      },
    });

    const result = await invokeChatRuntime({
      tenantId: agent.tenant_id,
      agentId: binding.agent_id,
      conversationId: conversation.id,
      message: inbound.text,
      endUser: {
        name: inbound.profileName || `wa:${inbound.from}`,
        phone: inbound.from,
      },
      channelContext: {
        provider: "whatsapp",
        binding_id: binding.id,
        peer_key: peerKey,
      },
    });

    if (result?.response) {
      await sendWhatsAppMessage(binding, inbound.from, result.response);
    }

    return new Response(JSON.stringify({ ok: true, conversation_id: conversation.id, response: result?.response || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("WhatsApp webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
