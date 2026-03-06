import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MemoryAction = "recall" | "upsert" | "forget" | "rebuild_summary" | "decay";

function scoreMemory(item: any, terms: string[]): number {
  const now = Date.now();
  const content = String(item.content || "").toLowerCase();
  const relevance = terms.length ? terms.filter((t) => content.includes(t)).length / terms.length : 0;
  const updatedAt = item.updated_at || item.last_seen_at || new Date().toISOString();
  const recencyMs = Math.max(0, now - new Date(updatedAt).getTime());
  const recency = Math.max(0, 1 - recencyMs / (1000 * 60 * 60 * 24 * 90));
  const confidence = Math.max(0, Math.min(1, Number(item.confidence ?? 0.6)));
  const importance = Math.max(0, Math.min(1, Number(item.importance ?? 3) / 5));
  const riskPenalty = item.risk_level === "high" ? 0.15 : item.risk_level === "medium" ? 0.05 : 0;
  return relevance * 0.4 + recency * 0.2 + confidence * 0.2 + importance * 0.2 - riskPenalty;
}

function buildSummary(items: any[]): string {
  const grouped = new Map<string, string[]>();
  for (const item of items) {
    const type = String(item.memory_type || "fact").toUpperCase();
    const arr = grouped.get(type) || [];
    arr.push(`- ${item.content}`);
    grouped.set(type, arr);
  }

  return Array.from(grouped.entries())
    .map(([type, rows]) => `[${type}]\n${rows.join("\n")}`)
    .join("\n\n");
}

async function applyDecay(supabase: any, tenantId: string, decayDays: number) {
  const cutoff = new Date(Date.now() - decayDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleItems } = await supabase
    .from("memory_items")
    .select("id, user_ref")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .lt("last_seen_at", cutoff)
    .is("expires_at", null)
    .limit(200);

  if (!staleItems?.length) {
    return { expired_count: 0 };
  }

  const staleIds = staleItems.map((x: any) => x.id);
  await supabase.from("memory_items").update({ status: "expired" }).in("id", staleIds);

  await supabase.from("memory_access_logs").insert(
    staleItems.map((x: any) => ({
      tenant_id: tenantId,
      conversation_id: null,
      user_ref: x.user_ref,
      memory_item_id: x.id,
      action: "expire",
      metadata: { reason: "memory_api_decay", cutoff },
    })),
  );

  await supabase
    .from("memory_conflicts")
    .update({ status: "ignored", resolution_note: "Auto-ignored by memory decay", resolved_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .lt("created_at", cutoff);

  return { expired_count: staleItems.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = (body.action || "recall") as MemoryAction;
    const tenantId = body.tenant_id as string;

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "recall") {
      const userRef = body.user_ref as string;
      const query = String(body.query || "");
      const conversationId = body.conversation_id || null;

      if (!userRef) {
        return new Response(JSON.stringify({ error: "user_ref is required for recall" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const terms = query
        .toLowerCase()
        .replace(/[^\w\sàáạảãăắằặẳẵâấầậẩẫèéẹẻẽêếềệểễìíịỉĩòóọỏõôốồộổỗơớờợởỡùúụủũưứừựửữỳýỵỷỹđ]/gi, "")
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 8);

      const { data: items } = await supabase
        .from("memory_items")
        .select("id, memory_type, memory_key, content, confidence, importance, risk_level, updated_at, last_seen_at")
        .eq("tenant_id", tenantId)
        .eq("user_ref", userRef)
        .eq("status", "active")
        .order("importance", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(30);

      const ranked = (items || [])
        .map((item: any) => ({ item, score: scoreMemory(item, terms) }))
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, Number(body.limit || 8));

      if (ranked.length) {
        await supabase.from("memory_access_logs").insert(
          ranked.map(({ item, score }: any) => ({
            tenant_id: tenantId,
            conversation_id: conversationId,
            user_ref: userRef,
            memory_item_id: item.id,
            action: "recall",
            score,
            metadata: { reason: "memory_api_recall" },
          })),
        );
      }

      return new Response(JSON.stringify({
        items: ranked.map((x: any) => ({ ...x.item, score: x.score })),
        summary: buildSummary(ranked.map((x: any) => x.item)),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upsert") {
      const memory = body.memory || {};
      const userRef = String(memory.user_ref || "");
      if (!userRef || !memory.content) {
        return new Response(JSON.stringify({ error: "memory.user_ref and memory.content are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload = {
        tenant_id: tenantId,
        user_ref: userRef,
        memory_type: memory.memory_type || "fact",
        memory_key: memory.memory_key || null,
        content: memory.content,
        confidence: Number(memory.confidence ?? 0.7),
        importance: Number(memory.importance ?? 3),
        risk_level: memory.risk_level || "low",
        source_conversation_id: memory.source_conversation_id || null,
        source_message_id: memory.source_message_id || null,
        metadata: memory.metadata || {},
      };

      let row = null;
      if (payload.memory_key) {
        const { data: existing } = await supabase
          .from("memory_items")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("user_ref", userRef)
          .eq("memory_key", payload.memory_key)
          .eq("status", "active")
          .maybeSingle();

        if (existing?.id) {
          const { data: updated } = await supabase
            .from("memory_items")
            .update({
              ...payload,
              last_seen_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .select("*")
            .single();
          row = updated;
        }
      }

      if (!row) {
        const { data: inserted } = await supabase
          .from("memory_items")
          .insert(payload)
          .select("*")
          .single();
        row = inserted;
      }

      if (row?.id) {
        await supabase.from("memory_access_logs").insert({
          tenant_id: tenantId,
          conversation_id: payload.source_conversation_id,
          user_ref: userRef,
          memory_item_id: row.id,
          action: "write",
          metadata: { reason: "memory_api_upsert", memory_key: payload.memory_key },
        });
      }

      return new Response(JSON.stringify({ item: row }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "forget") {
      const userRef = String(body.user_ref || "");
      const id = body.memory_item_id as string | undefined;
      const memoryKey = body.memory_key as string | undefined;

      if (!userRef || (!id && !memoryKey)) {
        return new Response(JSON.stringify({ error: "user_ref and memory_item_id or memory_key are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let query = supabase
        .from("memory_items")
        .update({ status: "deleted" })
        .eq("tenant_id", tenantId)
        .eq("user_ref", userRef)
        .eq("status", "active");

      if (id) query = query.eq("id", id);
      if (memoryKey) query = query.eq("memory_key", memoryKey);

      await query;

      await supabase.from("memory_access_logs").insert({
        tenant_id: tenantId,
        conversation_id: body.conversation_id || null,
        user_ref: userRef,
        memory_item_id: id || null,
        action: "delete",
        metadata: { reason: "memory_api_forget", memory_key: memoryKey || null },
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "rebuild_summary") {
      const userRef = String(body.user_ref || "");
      if (!userRef) {
        return new Response(JSON.stringify({ error: "user_ref is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: items } = await supabase
        .from("memory_items")
        .select("id, memory_type, content, confidence, importance, risk_level, updated_at, last_seen_at")
        .eq("tenant_id", tenantId)
        .eq("user_ref", userRef)
        .eq("status", "active")
        .order("importance", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(50);

      const summary = buildSummary(items || []);

      const { data: existing } = await supabase
        .from("memory_summaries")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_ref", userRef)
        .eq("summary_type", "rolling")
        .maybeSingle();

      let row = null;
      if (existing?.id) {
        const { data: updated } = await supabase
          .from("memory_summaries")
          .update({
            content: summary,
            source_count: (items || []).length,
            generated_at: new Date().toISOString(),
            metadata: { reason: "memory_api_rebuild" },
          })
          .eq("id", existing.id)
          .select("*")
          .single();
        row = updated;
      } else {
        const { data: inserted } = await supabase
          .from("memory_summaries")
          .insert({
            tenant_id: tenantId,
            user_ref: userRef,
            summary_type: "rolling",
            content: summary,
            source_count: (items || []).length,
            generated_at: new Date().toISOString(),
            metadata: { reason: "memory_api_rebuild" },
          })
          .select("*")
          .single();
        row = inserted;
      }

      return new Response(JSON.stringify({ summary: row }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "decay") {
      const decayDays = Number(body.decay_days || 30);
      const result = await applyDecay(supabase, tenantId, decayDays);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unsupported action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("memory function error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
