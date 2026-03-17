import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type OpenVikingAction =
  | "diagnostics"
  | "get_node"
  | "list_children"
  | "upsert_node"
  | "insert_vector"
  | "search_vectors";

const OPENVIKING_EMBEDDING_DIMENSION = 1536;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = String(body.action || "diagnostics") as OpenVikingAction;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const context = await resolveOpenVikingContext(supabase, {
      accountId: body.account_id,
      tenantId: body.tenant_id,
    });

    if (action === "diagnostics") {
      const data = await getOpenVikingDiagnostics(supabase, context);
      return json({ ok: true, action, data });
    }

    if (action === "get_node") {
      const path = String(body.path || "");
      const node = await getAgfsNodeByPath(supabase, context, path);
      return json({ ok: true, action, node });
    }

    if (action === "list_children") {
      const parentPath = body.parent_path === null || body.parent_path === undefined
        ? "viking://"
        : String(body.parent_path);
      const nodes = await listAgfsChildren(supabase, context, parentPath);
      return json({ ok: true, action, nodes });
    }

    if (action === "upsert_node") {
      const node = await upsertAgfsNode(supabase, context, {
        path: String(body.path || ""),
        parentPath: body.parent_path ?? undefined,
        nodeType: body.node_type,
        level: body.level,
        title: body.title,
        content: body.content,
        metadata: body.metadata || {},
      });
      return json({ ok: true, action, node });
    }

    if (action === "insert_vector") {
      const row = await insertVikingVector(supabase, context, {
        nodeId: body.node_id || null,
        embedding: body.embedding || [],
        content: String(body.content || ""),
        chunkIndex: body.chunk_index,
        embeddingModel: body.embedding_model,
        metadata: body.metadata || {},
      });
      return json({ ok: true, action, row });
    }

    if (action === "search_vectors") {
      const matches = await searchVikingVectors(
        supabase,
        context,
        body.query_embedding || [],
        Number(body.top_k || 5),
      );
      return json({ ok: true, action, matches });
    }

    return json({ ok: false, error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    console.error("openviking-memory error:", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

async function resolveOpenVikingContext(
  supabase: any,
  input: { accountId?: string | null; tenantId?: string | null },
) {
  const accountId = String(input.accountId || "").trim();
  const tenantId = input.tenantId ? String(input.tenantId).trim() : null;
  if (!accountId) throw new Error("account_id is required");

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", accountId);

  const isSystemAdmin = (roleRows || []).some((row: any) => row.role === "system_admin");
  return { accountId, tenantId, isSystemAdmin };
}

function normalizeVikingPath(path: string): string {
  const trimmed = String(path || "").trim();
  if (!trimmed.startsWith("viking://")) throw new Error("path must start with viking://");
  const suffix = trimmed.slice("viking://".length).split("/").filter(Boolean).join("/");
  return suffix ? `viking://${suffix}` : "viking://";
}

function deriveParentPath(path: string): string | null {
  const normalized = normalizeVikingPath(path);
  if (normalized === "viking://") return null;
  const parts = normalized.slice("viking://".length).split("/").filter(Boolean);
  if (parts.length <= 1) return "viking://";
  return `viking://${parts.slice(0, -1).join("/")}`;
}

function inferNodeLevel(path: string): number {
  const normalized = normalizeVikingPath(path);
  if (normalized === "viking://") return 0;
  return normalized.slice("viking://".length).split("/").filter(Boolean).length;
}

function validateEmbedding(values: number[]): number[] {
  if (!Array.isArray(values)) throw new Error("embedding must be an array");
  if (values.length !== OPENVIKING_EMBEDDING_DIMENSION) {
    throw new Error(`embedding must have ${OPENVIKING_EMBEDDING_DIMENSION} dimensions`);
  }
  const normalized = values.map((v) => Number(v));
  if (normalized.some((v) => !Number.isFinite(v))) throw new Error("embedding contains non-numeric values");
  return normalized;
}

function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

async function getAgfsNodeByPath(supabase: any, context: any, path: string) {
  const normalizedPath = normalizeVikingPath(path);
  const query = supabase
    .from("agfs_nodes")
    .select("*")
    .eq("account_id", context.accountId)
    .eq("path", normalizedPath)
    .maybeSingle();
  if (context.tenantId) query.eq("tenant_id", context.tenantId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function listAgfsChildren(supabase: any, context: any, parentPath: string | null) {
  const normalizedParent = parentPath ? normalizeVikingPath(parentPath) : null;
  const query = supabase
    .from("agfs_nodes")
    .select("*")
    .eq("account_id", context.accountId)
    .order("level", { ascending: true })
    .order("path", { ascending: true });
  if (normalizedParent === null) query.is("parent_path", null);
  else query.eq("parent_path", normalizedParent);
  if (context.tenantId) query.eq("tenant_id", context.tenantId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function upsertAgfsNode(supabase: any, context: any, input: any) {
  const path = normalizeVikingPath(input.path);
  const parentPath = input.parentPath !== undefined
    ? (input.parentPath ? normalizeVikingPath(input.parentPath) : null)
    : deriveParentPath(path);
  const payload = {
    account_id: context.accountId,
    tenant_id: context.tenantId || null,
    path,
    parent_path: parentPath,
    node_type: input.nodeType || "document",
    level: input.level ?? inferNodeLevel(path),
    title: input.title || null,
    content: input.content || null,
    content_hash: null,
    metadata: input.metadata || {},
  };
  const { data, error } = await supabase
    .from("agfs_nodes")
    .upsert(payload, { onConflict: "account_id,path" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function insertVikingVector(supabase: any, context: any, input: any) {
  const embedding = validateEmbedding(input.embedding);
  const payload = {
    account_id: context.accountId,
    tenant_id: context.tenantId || null,
    node_id: input.nodeId || null,
    embedding: toVectorLiteral(embedding),
    embedding_model: input.embeddingModel || "text-embedding-3-small",
    content: input.content,
    chunk_index: Number(input.chunkIndex || 0),
    metadata: input.metadata || {},
  };
  const { data, error } = await supabase
    .from("viking_vectors")
    .insert(payload)
    .select("id, node_id, tenant_id, chunk_index, embedding_model, created_at")
    .single();
  if (error) throw error;
  return data;
}

async function searchVikingVectors(supabase: any, context: any, queryEmbedding: number[], topK = 5) {
  const embedding = validateEmbedding(queryEmbedding);
  const { data, error } = await supabase.rpc("match_viking_vectors", {
    query_embedding: toVectorLiteral(embedding),
    match_count: topK,
    filter_tenant_id: context.tenantId || null,
    filter_account_id: context.accountId,
  });
  if (error) throw error;
  return data || [];
}

async function getOpenVikingDiagnostics(supabase: any, context: any) {
  const [root, children, vectorCount] = await Promise.all([
    getAgfsNodeByPath(supabase, context, "viking://").catch(() => null),
    listAgfsChildren(supabase, context, "viking://").catch(() => []),
    supabase
      .from("viking_vectors")
      .select("id", { count: "exact", head: true })
      .eq("account_id", context.accountId)
      .then(({ count, error }: any) => {
        if (error) throw error;
        return count || 0;
      }),
  ]);

  return {
    context,
    root_exists: !!root,
    root_children_count: children.length,
    vector_count: vectorCount,
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
