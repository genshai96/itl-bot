import { supabase } from "@/integrations/supabase/client";

// ==================== FILE UPLOAD ====================
export async function uploadChatAttachment(file: File, tenantId: string): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from("chat-attachments").upload(path, file);
  if (error) throw error;

  const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  return data.publicUrl;
}

export async function extractFileContent(fileUrls: string[], tenantId: string) {
  const { data, error } = await supabase.functions.invoke("extract-file-content", {
    body: { file_urls: fileUrls, tenant_id: tenantId },
  });
  if (error) throw error;
  return data as {
    results: Array<{ url: string; type: string; content?: string; strategy?: string; kb_document_id?: string; error?: string }>;
  };
}

// ==================== CHAT ====================
export async function sendChatMessage({
  tenantId,
  message,
  conversationId,
  endUser,
  attachments,
}: {
  tenantId: string;
  message: string;
  conversationId?: string;
  endUser?: { name?: string; email?: string; phone?: string; role?: string };
  attachments?: Array<{ url: string; type: string; content?: string }>;
}) {
  const { data, error } = await supabase.functions.invoke("chat", {
    body: {
      tenant_id: tenantId,
      message,
      conversation_id: conversationId,
      end_user: endUser,
      attachments,
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

// ==================== STREAMING CHAT ====================
export async function sendChatMessageStream({
  tenantId,
  message,
  conversationId,
  endUser,
  attachments,
  onToken,
  onDone,
  onError,
}: {
  tenantId: string;
  message: string;
  conversationId?: string;
  endUser?: { name?: string; email?: string; phone?: string; role?: string };
  attachments?: Array<{ url: string; type: string; content?: string }>;
  onToken: (token: string) => void;
  onDone: (result: { conversation_id: string; full_response: string; tool_used?: string; tool_latency_ms?: number }) => void;
  onError: (err: Error) => void;
}) {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const url = `${supabaseUrl}/functions/v1/chat-stream`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        message,
        conversation_id: conversationId,
        end_user: endUser,
        attachments,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No readable stream");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";
    let convId = conversationId || "";
    let toolUsed: string | undefined;
    let toolLatency: number | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;

        try {
          const evt = JSON.parse(payload);
          if (evt.type === "token") {
            fullResponse += evt.content;
            onToken(evt.content);
          } else if (evt.type === "meta") {
            convId = evt.conversation_id || convId;
            toolUsed = evt.tool_used;
            toolLatency = evt.tool_latency_ms;
          }
        } catch { /* skip malformed */ }
      }
    }

    onDone({ conversation_id: convId, full_response: fullResponse, tool_used: toolUsed, tool_latency_ms: toolLatency });
  } catch (err: any) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ==================== MODELS ====================

export interface ModelInfo {
  id: string;
  name?: string;
  owned_by?: string;
}

export async function fetchProviderModels(endpoint: string, apiKey: string): Promise<ModelInfo[]> {
  const { data, error } = await supabase.functions.invoke("fetch-models", {
    body: { endpoint, api_key: apiKey },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.models || []) as ModelInfo[];
}

// ==================== DOCUMENT PROCESSING ====================
export async function processDocument({
  tenantId,
  documentId,
  content,
  chunkSize = 500,
  chunkOverlap = 50,
}: {
  tenantId: string;
  documentId: string;
  content: string;
  chunkSize?: number;
  chunkOverlap?: number;
}) {
  const { data, error } = await supabase.functions.invoke("process-document", {
    body: {
      tenant_id: tenantId,
      document_id: documentId,
      content,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap,
    },
  });
  if (error) throw error;
  return data as { success: boolean; chunks_created: number; embeddings_generated: boolean };
}
