import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  getServiceClient,
  getAgentTenant,
  findOrCreateChannelConversation,
  invokeChatRuntime,
  resolveChannelBinding,
  sendTelegramMessage,
  telegramTextFromUpdate,
} from "../_shared/channel-runtime.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      return new Response(JSON.stringify({ ok: true, provider: "telegram" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secretHeader = req.headers.get("x-telegram-bot-api-secret-token") || "";
    const body = await req.json();
    const inbound = telegramTextFromUpdate(body);

    if (!inbound) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_text_message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getServiceClient();
    const binding = await resolveChannelBinding(supabase, "telegram", (row: any) => {
      const config = row.config || {};
      const headerOk = config.webhookSecret ? config.webhookSecret === secretHeader : true;
      return headerOk && (!config.botUsername || config.botUsername === inbound.username || config.botUsername === `@${inbound.username}`);
    });

    if (!binding) {
      return new Response(JSON.stringify({ error: "No enabled Telegram binding matched this webhook" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // allowFrom whitelist: if set, only allow messages from listed user IDs or usernames
    if (Array.isArray(binding.config?.allowFrom) && binding.config.allowFrom.length > 0) {
      const allowed: string[] = binding.config.allowFrom.map((x: any) => String(x).toLowerCase().replace(/^@/, ""));
      const fromIdStr = String(inbound.fromId);
      const fromUsername = (inbound.username || "").toLowerCase().replace(/^@/, "");
      const isAllowed = allowed.includes(fromIdStr) || (fromUsername && allowed.includes(fromUsername));
      if (!isAllowed) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "sender_not_allowed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (inbound.isGroup && binding.config?.requireMention && binding.config?.botUsername) {
      const username = String(binding.config.botUsername).replace(/^@/, "").toLowerCase();
      if (!inbound.text.toLowerCase().includes(`@${username}`)) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "mention_required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const agent = await getAgentTenant(supabase, binding.agent_id);
    if (!agent?.tenant_id) {
      return new Response(JSON.stringify({ error: "Binding agent not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const peerKey = `telegram:${inbound.chatId}:${inbound.fromId}`;
    const conversation = await findOrCreateChannelConversation(supabase, {
      tenantId: agent.tenant_id,
      agentId: binding.agent_id,
      channelType: "telegram",
      peerKey,
      channelMetadata: {
        chat_id: inbound.chatId,
        from_id: inbound.fromId,
        username: inbound.username || null,
        is_group: inbound.isGroup,
      },
      endUser: {
        name: inbound.name,
        phone: `tg:${inbound.fromId}`,
      },
    });

    const result = await invokeChatRuntime({
      tenantId: agent.tenant_id,
      agentId: binding.agent_id,
      conversationId: conversation.id,
      message: inbound.text,
      endUser: {
        name: inbound.name,
        phone: `tg:${inbound.fromId}`,
      },
      channelContext: {
        provider: "telegram",
        binding_id: binding.id,
        peer_key: peerKey,
      },
    });

    if (result?.response) {
      await sendTelegramMessage(binding, inbound.chatId, result.response);
    }

    return new Response(JSON.stringify({ ok: true, conversation_id: conversation.id, response: result?.response || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Telegram webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
