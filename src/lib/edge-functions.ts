import { supabase } from "@/integrations/supabase/client";

type EdgeFunctionPayload = {
  ok?: boolean;
  error?: string;
  message?: string;
  code?: string;
  errors?: string[];
  details?: unknown;
};

function messageFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const data = payload as EdgeFunctionPayload;

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.join("; ");
  }

  if (typeof data.error === "string" && data.error.trim()) return data.error;
  if (typeof data.message === "string" && data.message.trim()) return data.message;

  return null;
}

async function messageFromResponseLike(response: unknown): Promise<string | null> {
  if (!(response instanceof Response)) return null;

  try {
    const cloned = response.clone();
    const contentType = cloned.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await cloned.json();
      return messageFromPayload(json) || JSON.stringify(json);
    }

    const text = await cloned.text();
    return text || null;
  } catch {
    return null;
  }
}

async function recoverIfInvalidJwt(message: string) {
  if (!/invalid jwt|jwt expired|unauthorized|invalid session/i.test(message)) return;

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Best effort only.
  }
}

export async function getEdgeFunctionErrorMessage(error: unknown, data?: unknown): Promise<string> {
  const payloadMessage = messageFromPayload(data);
  if (payloadMessage) {
    await recoverIfInvalidJwt(payloadMessage);
    return payloadMessage;
  }

  if (error && typeof error === "object") {
    const maybeContext = (error as { context?: unknown }).context;
    const contextMessage = await messageFromResponseLike(maybeContext);
    if (contextMessage) {
      await recoverIfInvalidJwt(contextMessage);
      return contextMessage;
    }

    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      await recoverIfInvalidJwt(maybeMessage);
      return maybeMessage;
    }
  }

  return "Edge Function request failed";
}

export async function assertEdgeFunctionSuccess<T>(result: { data: T | null; error: unknown }): Promise<T> {
  const { data, error } = result;

  const payloadError = messageFromPayload(data);
  if (error || payloadError) {
    throw new Error(await getEdgeFunctionErrorMessage(error, data));
  }

  return data as T;
}
