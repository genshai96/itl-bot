import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface OpenVikingContext {
  accountId: string;
  tenantId?: string | null;
  isSystemAdmin?: boolean;
}

export interface AgfsNodeInput {
  path: string;
  parentPath?: string | null;
  nodeType?: "folder" | "document" | "memory" | "skill" | "resource";
  level?: number | null;
  title?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown>;
}

export interface VikingVectorInput {
  nodeId?: string | null;
  embedding: number[];
  content: string;
  chunkIndex?: number;
  embeddingModel?: string;
  metadata?: Record<string, unknown>;
}

export const OPENVIKING_EMBEDDING_DIMENSION = 1536;

export function createServiceRoleClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function resolveOpenVikingContext(
  supabase: any,
  input: { accountId?: string | null; tenantId?: string | null },
): Promise<OpenVikingContext> {
  const accountId = String(input.accountId || "").trim();
  const tenantId = input.tenantId ? String(input.tenantId).trim() : null;

  if (!accountId) {
    throw new Error("account_id is required");
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", accountId);

  const isSystemAdmin = (roleRows || []).some((row: any) => row.role === "system_admin");
  return { accountId, tenantId, isSystemAdmin };
}

export function normalizeVikingPath(path: string): string {
  const trimmed = String(path || "").trim();
  if (!trimmed.startsWith("viking://")) {
    throw new Error("path must start with viking://");
  }

  const suffix = trimmed.slice("viking://".length);
  const normalizedSuffix = suffix
    .split("/")
    .filter(Boolean)
    .join("/");

  return normalizedSuffix ? `viking://${normalizedSuffix}` : "viking://";
}

export function deriveParentPath(path: string): string | null {
  const normalized = normalizeVikingPath(path);
  if (normalized === "viking://") return null;
  const suffix = normalized.slice("viking://".length);
  const parts = suffix.split("/").filter(Boolean);
  if (parts.length <= 1) return "viking://";
  return `viking://${parts.slice(0, -1).join("/")}`;
}

export function inferNodeLevel(path: string): number {
  const normalized = normalizeVikingPath(path);
  if (normalized === "viking://") return 0;
  return normalized.slice("viking://".length).split("/").filter(Boolean).length;
}

export function validateEmbedding(values: number[]): number[] {
  if (!Array.isArray(values)) {
    throw new Error("embedding must be an array");
  }
  if (values.length !== OPENVIKING_EMBEDDING_DIMENSION) {
    throw new Error(`embedding must have ${OPENVIKING_EMBEDDING_DIMENSION} dimensions`);
  }

  const normalized = values.map((v) => Number(v));
  if (normalized.some((v) => !Number.isFinite(v))) {
    throw new Error("embedding contains non-numeric values");
  }
  return normalized;
}

function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function getAgfsNodeByPath(supabase: any, context: OpenVikingContext, path: string) {
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

export async function listAgfsChildren(supabase: any, context: OpenVikingContext, parentPath: string | null) {
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

export async function upsertAgfsNode(supabase: any, context: OpenVikingContext, input: AgfsNodeInput) {
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

  console.log("[openviking] upsertAgfsNode", { account_id: context.accountId, tenant_id: context.tenantId, path });

  const { data, error } = await supabase
    .from("agfs_nodes")
    .upsert(payload, { onConflict: "account_id,path" })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function insertVikingVector(supabase: any, context: OpenVikingContext, input: VikingVectorInput) {
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

  console.log("[openviking] insertVikingVector", {
    account_id: context.accountId,
    tenant_id: context.tenantId,
    node_id: payload.node_id,
    chunk_index: payload.chunk_index,
  });

  const { data, error } = await supabase
    .from("viking_vectors")
    .insert(payload)
    .select("id, node_id, tenant_id, chunk_index, embedding_model, created_at")
    .single();

  if (error) throw error;
  return data;
}

export async function searchVikingVectors(
  supabase: any,
  context: OpenVikingContext,
  queryEmbedding: number[],
  topK = 5,
) {
  const embedding = validateEmbedding(queryEmbedding);

  console.log("[openviking] searchVikingVectors", {
    account_id: context.accountId,
    tenant_id: context.tenantId,
    top_k: topK,
  });

  const { data, error } = await supabase.rpc("match_viking_vectors", {
    query_embedding: toVectorLiteral(embedding),
    match_count: topK,
    filter_tenant_id: context.tenantId || null,
    filter_account_id: context.accountId,
  });

  if (error) throw error;
  return data || [];
}

export async function getOpenVikingDiagnostics(supabase: any, context: OpenVikingContext) {
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
