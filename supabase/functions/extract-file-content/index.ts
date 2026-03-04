import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ~50 pages of text ≈ 100k chars. Above this → auto-import to KB
const SMALL_FILE_CHAR_LIMIT = 100_000;
// For on-the-fly summary, send chunks of this size to AI
const SUMMARY_CHUNK_SIZE = 12_000;
// Max chars to inject directly into chat context
const DIRECT_INJECT_LIMIT = 8_000;

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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Array<{
      url: string;
      type: string;
      content?: string;
      strategy?: "direct" | "summarized" | "kb_imported";
      kb_document_id?: string;
      error?: string;
    }> = [];

    for (const fileUrl of file_urls) {
      try {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          results.push({ url: fileUrl, type: "unknown", error: `Failed to download: ${response.status}` });
          continue;
        }

        const contentType = response.headers.get("content-type") || "";
        const urlLower = fileUrl.toLowerCase();
        const fileName = decodeURIComponent(fileUrl.split("/").pop() || "file");

        // === IMAGE FILES — base64 for multimodal ===
        if (contentType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp)/.test(urlLower)) {
          const arrayBuffer = await response.arrayBuffer();
          // Limit image size to 1MB for base64
          if (arrayBuffer.byteLength > 1_048_576) {
            results.push({
              url: fileUrl,
              type: "image",
              strategy: "direct",
              content: `[Hình ảnh "${fileName}" (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB) — quá lớn để xử lý trực tiếp. Vui lòng mô tả nội dung hình ảnh.]`,
            });
            continue;
          }
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          const mimeType = contentType || "image/png";
          results.push({
            url: fileUrl,
            type: "image",
            strategy: "direct",
            content: `data:${mimeType};base64,${base64}`,
          });
          continue;
        }

        // === TEXT-BASED FILES ===
        let fullText = "";
        let fileType = "text";

        if (
          contentType.includes("text/") ||
          contentType.includes("application/json") ||
          /\.(txt|md|csv|json|xml|yaml|yml|log|tsv)/.test(urlLower)
        ) {
          fullText = await response.text();
          fileType = urlLower.match(/\.(\w+)$/)?.[1] || "txt";
        } else if (contentType.includes("application/pdf") || urlLower.endsWith(".pdf")) {
          const arrayBuffer = await response.arrayBuffer();
          fullText = extractPdfText(new Uint8Array(arrayBuffer));
          fileType = "pdf";
          if (!fullText.trim()) {
            results.push({
              url: fileUrl,
              type: "pdf",
              strategy: "direct",
              content: `[PDF "${fileName}" — không thể trích xuất text. Có thể là file scan/hình ảnh. Cần OCR để đọc.]`,
            });
            continue;
          }
        } else {
          results.push({
            url: fileUrl,
            type: "other",
            strategy: "direct",
            content: `[File "${fileName}" đã upload. Định dạng chưa hỗ trợ trích xuất nội dung.]`,
          });
          continue;
        }

        const charCount = fullText.length;
        const estimatedPages = Math.ceil(charCount / 2000);

        // === STRATEGY ROUTING ===
        if (charCount <= DIRECT_INJECT_LIMIT) {
          // SMALL: inject directly
          results.push({
            url: fileUrl,
            type: fileType,
            strategy: "direct",
            content: `--- Nội dung file "${fileName}" (${estimatedPages} trang) ---\n${fullText}`,
          });
        } else if (charCount <= SMALL_FILE_CHAR_LIMIT) {
          // MEDIUM (<50 pages): summarize on-the-fly using AI
          if (!lovableApiKey) {
            // No AI key — truncate with notice
            results.push({
              url: fileUrl,
              type: fileType,
              strategy: "direct",
              content: `--- File "${fileName}" (~${estimatedPages} trang, hiển thị phần đầu) ---\n${fullText.substring(0, DIRECT_INJECT_LIMIT)}\n\n...[còn ${charCount - DIRECT_INJECT_LIMIT} ký tự chưa hiển thị]`,
            });
            continue;
          }

          try {
            const summary = await summarizeText(fullText, fileName, lovableApiKey);
            results.push({
              url: fileUrl,
              type: fileType,
              strategy: "summarized",
              content: `--- Tóm tắt AI của "${fileName}" (~${estimatedPages} trang, ${charCount.toLocaleString()} ký tự) ---\n${summary}\n\n[Lưu ý: Đây là bản tóm tắt. Hỏi cụ thể nếu cần chi tiết từ phần nào.]`,
            });
          } catch (sumErr) {
            console.error("Summarization failed:", sumErr);
            results.push({
              url: fileUrl,
              type: fileType,
              strategy: "direct",
              content: `--- File "${fileName}" (~${estimatedPages} trang, hiển thị phần đầu) ---\n${fullText.substring(0, DIRECT_INJECT_LIMIT)}\n\n...[file quá dài, tóm tắt AI thất bại]`,
            });
          }
        } else {
          // LARGE (>50 pages): auto-import to Knowledge Base
          if (!tenant_id) {
            results.push({
              url: fileUrl,
              type: fileType,
              strategy: "direct",
              content: `[File "${fileName}" (~${estimatedPages} trang) quá lớn để xử lý trực tiếp. Cần tenant_id để import vào Knowledge Base.]`,
            });
            continue;
          }

          try {
            const docId = await importToKnowledgeBase(supabase, tenant_id, fileName, fullText, fileUrl);

            // Also provide a brief summary for immediate context
            let briefSummary = "";
            if (lovableApiKey) {
              try {
                briefSummary = await summarizeText(
                  fullText.substring(0, SUMMARY_CHUNK_SIZE * 3), // summarize first ~36k chars
                  fileName,
                  lovableApiKey,
                  true // brief mode
                );
              } catch { /* ignore */ }
            }

            results.push({
              url: fileUrl,
              type: fileType,
              strategy: "kb_imported",
              kb_document_id: docId,
              content: `--- File "${fileName}" (~${estimatedPages} trang, ${charCount.toLocaleString()} ký tự) ---\n` +
                `✅ File đã được tự động import vào Knowledge Base (${Math.ceil(charCount / 500)} chunks).\n` +
                `Bạn có thể hỏi bất kỳ câu hỏi nào về nội dung file — AI sẽ tìm kiếm trong Knowledge Base để trả lời chính xác.\n` +
                (briefSummary ? `\n📋 Tổng quan nhanh:\n${briefSummary}` : ""),
            });
          } catch (kbErr) {
            console.error("KB import failed:", kbErr);
            // Fallback: summarize what we can
            let fallbackContent = `[File "${fileName}" (~${estimatedPages} trang) quá lớn. Import KB thất bại.]`;
            if (lovableApiKey) {
              try {
                const summary = await summarizeText(fullText.substring(0, SUMMARY_CHUNK_SIZE * 2), fileName, lovableApiKey);
                fallbackContent = `--- Tóm tắt phần đầu "${fileName}" (~${estimatedPages} trang) ---\n${summary}\n\n[Lưu ý: File quá lớn và import KB thất bại. Chỉ tóm tắt được phần đầu.]`;
              } catch { /* ignore */ }
            }
            results.push({ url: fileUrl, type: fileType, strategy: "summarized", content: fallbackContent });
          }
        }
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

// ==================== AI SUMMARIZATION ====================

async function summarizeText(
  text: string,
  fileName: string,
  apiKey: string,
  brief = false
): Promise<string> {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += SUMMARY_CHUNK_SIZE) {
    chunks.push(text.substring(i, i + SUMMARY_CHUNK_SIZE));
  }

  // If only 1 chunk, summarize directly
  if (chunks.length === 1 || brief) {
    return await callAiSummarize(
      chunks.slice(0, brief ? 1 : chunks.length).join("\n\n"),
      fileName,
      apiKey,
      brief
    );
  }

  // Multi-chunk: summarize each, then merge
  const chunkSummaries: string[] = [];
  for (let i = 0; i < Math.min(chunks.length, 8); i++) {
    const summary = await callAiSummarize(
      chunks[i],
      `${fileName} (phần ${i + 1}/${chunks.length})`,
      apiKey,
      true
    );
    chunkSummaries.push(`[Phần ${i + 1}] ${summary}`);
  }

  if (chunks.length > 8) {
    chunkSummaries.push(`[...còn ${chunks.length - 8} phần chưa được tóm tắt]`);
  }

  // Final merge summary
  const merged = chunkSummaries.join("\n\n");
  return await callAiSummarize(merged, `Tổng hợp ${fileName}`, apiKey, false);
}

async function callAiSummarize(content: string, context: string, apiKey: string, brief: boolean): Promise<string> {
  const systemPrompt = brief
    ? `Tóm tắt ngắn gọn nội dung sau trong 3-5 câu. Tập trung vào ý chính, số liệu quan trọng. Viết bằng tiếng Việt nếu nội dung tiếng Việt, ngược lại dùng ngôn ngữ gốc.`
    : `Tóm tắt chi tiết nội dung sau, giữ lại các điểm quan trọng, số liệu, kết luận. Sử dụng bullet points. Viết bằng tiếng Việt nếu nội dung tiếng Việt.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `File: ${context}\n\n${content}` },
      ],
      temperature: 0.2,
      max_tokens: brief ? 500 : 2000,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI summarize failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "[Không thể tóm tắt]";
}

// ==================== KB IMPORT ====================

async function importToKnowledgeBase(
  supabase: any,
  tenantId: string,
  fileName: string,
  fullText: string,
  fileUrl: string
): Promise<string> {
  const chunkSize = 500;
  const chunkOverlap = 50;

  // Create KB document
  const { data: doc, error: docErr } = await supabase
    .from("kb_documents")
    .insert({
      tenant_id: tenantId,
      name: `[Chat Upload] ${fileName}`,
      file_url: fileUrl,
      status: "processing",
    })
    .select("id")
    .single();

  if (docErr) throw docErr;

  // Chunk the text
  const chunks: Array<{ content: string; chunk_index: number; document_id: string; tenant_id: string }> = [];
  const words = fullText.split(/\s+/);
  let chunkIndex = 0;
  let i = 0;

  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize);
    chunks.push({
      content: chunkWords.join(" "),
      chunk_index: chunkIndex,
      document_id: doc.id,
      tenant_id: tenantId,
    });
    chunkIndex++;
    i += chunkSize - chunkOverlap;
  }

  // Insert chunks in batches of 50
  for (let b = 0; b < chunks.length; b += 50) {
    const batch = chunks.slice(b, b + 50);
    const { error: chunkErr } = await supabase.from("kb_chunks").insert(batch);
    if (chunkErr) {
      console.error("Chunk insert error:", chunkErr);
    }
  }

  // Update document status
  await supabase
    .from("kb_documents")
    .update({ status: "ready", chunk_count: chunks.length })
    .eq("id", doc.id);

  return doc.id;
}

// ==================== PDF TEXT EXTRACTION ====================

function extractPdfText(bytes: Uint8Array): string {
  const text = new TextDecoder("latin1").decode(bytes);
  const textParts: string[] = [];

  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(text)) !== null) {
    const block = match[1];
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textParts.push(tjMatch[1]);
    }
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
