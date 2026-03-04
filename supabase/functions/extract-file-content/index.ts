import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_urls, tenant_id } = await req.json();

    if (!file_urls || !Array.isArray(file_urls) || file_urls.length === 0) {
      return new Response(JSON.stringify({ error: "file_urls array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Array<{ url: string; type: string; content?: string; error?: string }> = [];

    for (const fileUrl of file_urls) {
      try {
        // Download the file
        const response = await fetch(fileUrl);
        if (!response.ok) {
          results.push({ url: fileUrl, type: "unknown", error: `Failed to download: ${response.status}` });
          continue;
        }

        const contentType = response.headers.get("content-type") || "";
        const urlLower = fileUrl.toLowerCase();

        // Image files — convert to base64 data URL for multimodal AI
        if (contentType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp)/.test(urlLower)) {
          const arrayBuffer = await response.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          const mimeType = contentType || "image/png";
          results.push({
            url: fileUrl,
            type: "image",
            content: `data:${mimeType};base64,${base64}`,
          });
          continue;
        }

        // Text-based files
        if (
          contentType.includes("text/") ||
          contentType.includes("application/json") ||
          contentType.includes("text/csv") ||
          /\.(txt|md|csv|json|xml|yaml|yml|log|tsv)/.test(urlLower)
        ) {
          const text = await response.text();
          const truncated = text.substring(0, 15000); // limit to 15k chars
          const ext = urlLower.match(/\.(\w+)$/)?.[1] || "txt";
          results.push({
            url: fileUrl,
            type: "text",
            content: `--- File content (${ext}) ---\n${truncated}${text.length > 15000 ? "\n...[truncated]" : ""}`,
          });
          continue;
        }

        // PDF — extract text naively (works for text-based PDFs)
        if (contentType.includes("application/pdf") || urlLower.endsWith(".pdf")) {
          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const pdfText = extractPdfText(bytes);
          if (pdfText.trim().length > 0) {
            const truncated = pdfText.substring(0, 15000);
            results.push({
              url: fileUrl,
              type: "pdf",
              content: `--- PDF content ---\n${truncated}${pdfText.length > 15000 ? "\n...[truncated]" : ""}`,
            });
          } else {
            results.push({
              url: fileUrl,
              type: "pdf",
              content: "[PDF file uploaded but text extraction was not possible — this may be a scanned/image-based PDF]",
            });
          }
          continue;
        }

        // Other files — just note they were uploaded
        results.push({
          url: fileUrl,
          type: "other",
          content: `[File uploaded: ${fileUrl.split("/").pop()}]`,
        });
      } catch (fileErr) {
        console.error("File processing error:", fileErr);
        results.push({
          url: fileUrl,
          type: "unknown",
          error: fileErr instanceof Error ? fileErr.message : "Processing failed",
        });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-file-content error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Basic PDF text extraction — extracts text from stream objects.
 * Works for text-based PDFs. For scanned PDFs, OCR would be needed.
 */
function extractPdfText(bytes: Uint8Array): string {
  const text = new TextDecoder("latin1").decode(bytes);
  const textParts: string[] = [];

  // Find text between BT and ET markers (text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(text)) !== null) {
    const block = match[1];
    // Extract text from Tj and TJ operators
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textParts.push(tjMatch[1]);
    }
    // TJ arrays
    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
    let tjArrMatch;
    while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
      const inner = tjArrMatch[1];
      const strRegex = /\(([^)]*)\)/g;
      let strMatch;
      while ((strMatch = strRegex.exec(inner)) !== null) {
        textParts.push(strMatch[1]);
      }
    }
  }

  return textParts.join(" ").replace(/\\n/g, "\n").replace(/\\r/g, "").trim();
}
