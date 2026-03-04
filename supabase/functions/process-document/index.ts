import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Process a KB document: chunk text → generate embeddings → store in kb_chunks.
 * POST { tenant_id, document_id, content, chunk_size?, chunk_overlap? }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, document_id, content, chunk_size = 500, chunk_overlap = 50 } = await req.json();

    if (!tenant_id || !document_id || !content) {
      return new Response(JSON.stringify({ error: "tenant_id, document_id, and content are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Chunk the text
    const chunks = chunkText(content, chunk_size, chunk_overlap);
    console.log(`Document ${document_id}: ${chunks.length} chunks created`);

    // 2. Get tenant config for embedding provider
    const { data: tenantConfig } = await supabase
      .from("tenant_configs")
      .select("provider_endpoint, provider_api_key")
      .eq("tenant_id", tenant_id)
      .single();

    let embeddings: number[][] = [];

    if (tenantConfig?.provider_endpoint && tenantConfig?.provider_api_key) {
      // Use tenant's provider for embeddings
      embeddings = await generateEmbeddings(
        chunks,
        tenantConfig.provider_endpoint,
        tenantConfig.provider_api_key
      );
    }

    // 3. Delete existing chunks for this document
    await supabase
      .from("kb_chunks")
      .delete()
      .eq("document_id", document_id);

    // 4. Insert new chunks
    const chunkRows = chunks.map((text, idx) => ({
      document_id,
      tenant_id,
      content: text,
      chunk_index: idx,
      embedding: embeddings[idx] ? `[${embeddings[idx].join(",")}]` : null,
      metadata: { char_count: text.length },
    }));

    // Insert in batches of 50
    for (let i = 0; i < chunkRows.length; i += 50) {
      const batch = chunkRows.slice(i, i + 50);
      const { error } = await supabase.from("kb_chunks").insert(batch);
      if (error) {
        console.error(`Batch insert error at ${i}:`, error);
      }
    }

    // 5. Update document status
    await supabase
      .from("kb_documents")
      .update({ status: "indexed", chunk_count: chunks.length })
      .eq("id", document_id);

    return new Response(JSON.stringify({
      success: true,
      chunks_created: chunks.length,
      embeddings_generated: embeddings.length > 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Process document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const sentences = text.split(/(?<=[.!?。\\n])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      // Keep overlap
      const words = current.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      current = overlapWords.join(" ") + " " + sentence;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

async function generateEmbeddings(chunks: string[], endpoint: string, apiKey: string): Promise<number[][]> {
  try {
    const baseUrl = endpoint.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
    const embeddingUrl = `${baseUrl}/embeddings`;

    // Process in batches of 20
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += 20) {
      const batch = chunks.slice(i, i + 20);
      const response = await fetch(embeddingUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: batch,
        }),
      });

      if (!response.ok) {
        console.warn(`Embedding API error: ${response.status}, skipping embeddings`);
        return [];
      }

      const data = await response.json();
      if (data?.data) {
        for (const item of data.data) {
          allEmbeddings.push(item.embedding);
        }
      }
    }
    return allEmbeddings;
  } catch (e) {
    console.warn("Embedding generation failed, continuing without:", e);
    return [];
  }
}
