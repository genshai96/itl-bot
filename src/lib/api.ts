import { supabase } from "@/integrations/supabase/client";

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
