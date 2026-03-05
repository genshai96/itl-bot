import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Generate embeddings for KB chunks that don't have them yet.
 * Uses tenant's configured embedding provider (OpenAI-compatible).
 * POST { tenant_id, document_id? }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenant_id, document_id } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get tenant embedding config
    const { data: config } = await supabase
      .from("tenant_configs")
      .select("provider_endpoint, provider_api_key, provider_model")
      .eq("tenant_id", tenant_id)
      .single();

    if (!config?.provider_endpoint || !config?.provider_api_key) {
      return new Response(JSON.stringify({
        error: "Embedding provider chưa được cấu hình. Vào Settings → Embedding để thiết lập.",
        needs_config: true,
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get chunks without embeddings
    let query = supabase
      .from("kb_chunks")
      .select("id, content")
      .eq("tenant_id", tenant_id)
      .is("embedding", null)
      .order("chunk_index", { ascending: true })
      .limit(200);

    if (document_id) {
      query = query.eq("document_id", document_id);
    }

    const { data: chunks, error: chunksError } = await query;
    if (chunksError) throw chunksError;
    if (!chunks || chunks.length === 0) {
      return new Response(JSON.stringify({ success: true, embedded: 0, message: "No chunks need embedding" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate embeddings in batches
    const baseUrl = config.provider_endpoint.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
    const embeddingUrl = `${baseUrl}/embeddings`;
    const model = config.provider_model || "text-embedding-3-small";

    let embedded = 0;
    const batchSize = 20;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.content);

      const response = await fetch(embeddingUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.provider_api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input: texts }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Embedding API error: ${response.status}`, errText);
        return new Response(JSON.stringify({
          error: `Embedding API error (${response.status}): ${errText.slice(0, 200)}`,
          embedded,
        }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      if (!data?.data) continue;

      // Update each chunk with its embedding
      for (let j = 0; j < data.data.length; j++) {
        const embedding = data.data[j].embedding;
        const chunkId = batch[j].id;
        const embeddingStr = `[${embedding.join(",")}]`;

        await supabase
          .from("kb_chunks")
          .update({ embedding: embeddingStr })
          .eq("id", chunkId);

        embedded++;
      }
    }

    // Update document status if specific document
    if (document_id) {
      await supabase
        .from("kb_documents")
        .update({ status: "indexed" })
        .eq("id", document_id);
    }

    return new Response(JSON.stringify({ success: true, embedded, total: chunks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-embeddings error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
