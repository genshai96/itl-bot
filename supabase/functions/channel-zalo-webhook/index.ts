import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  findOrCreateChannelConversation,
  getAgentTenant,
  getServiceClient,
  invokeChatRuntime,
  resolveChannelBinding,
  sendZaloMessage,
  zaloTextFromWebhook,
} from "../_shared/channel-runtime.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const verifyToken = url.searchParams.get("verify_token") || url.searchParams.get("oa_verify_token") || "";
      const challenge = url.searchParams.get("challenge") || url.searchParams.get("hub.challenge") || "ok";
      const supabase = getServiceClient();
      const binding = await resolveChannelBinding(supabase, "zalo", (row: any) => {
        const config = row.config || {};
        return !!verifyToken && config.verifyToken === verifyToken;
      });

      if (!binding) {
        return new Response(JSON.stringify({ error: "Invalid verify token" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(challenge, { headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }

    const body = await req.json();
    const inbound = zaloTextFromWebhook(body);
    if (!inbound) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_text_message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getServiceClient();
    const binding = await resolveChannelBinding(supabase, "zalo", (row: any) => {
      const config = row.config || {};
      if (config.oaId && inbound.oaId) return String(config.oaId) === String(inbound.oaId);
      return !!config.verifyToken;
    });

    if (!binding) {
      return new Response(JSON.stringify({ error: "No enabled Zalo binding matched this webhook" }), {
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

    const peerKey = `zalo:${inbound.userId}`;
    const conversation = await findOrCreateChannelConversation(supabase, {
      tenantId: agent.tenant_id,
      agentId: binding.agent_id,
      channelType: "zalo",
      peerKey,
      channelMetadata: {
        user_id: inbound.userId,
        oa_id: inbound.oaId || null,
      },
      endUser: {
        name: inbound.displayName || `zalo:${inbound.userId}`,
        phone: `zalo:${inbound.userId}`,
      },
    });

    const result = await invokeChatRuntime({
      tenantId: agent.tenant_id,
      agentId: binding.agent_id,
      conversationId: conversation.id,
      message: inbound.text,
      endUser: {
        name: inbound.displayName || `zalo:${inbound.userId}`,
        phone: `zalo:${inbound.userId}`,
      },
      channelContext: {
        provider: "zalo",
        binding_id: binding.id,
        peer_key: peerKey,
      },
    });

    if (result?.response) {
      await sendZaloMessage(binding, inbound.userId, result.response);
    }

    return new Response(JSON.stringify({ ok: true, conversation_id: conversation.id, response: result?.response || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Zalo webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
