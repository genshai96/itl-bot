import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { FileText, Upload, Search, Trash2, Loader2, CheckCircle2, XCircle, File, BrainCircuit, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useKbDocuments, useTenants, useTenantConfig } from "@/hooks/use-data";
import { processDocument } from "@/lib/api";
import { toast } from "sonner";
import { format } from "date-fns";

type UploadStep = "idle" | "reading" | "uploading" | "chunking" | "done" | "error";

const KnowledgeBase = () => {
  const { data: tenants } = useTenants();
  const [selectedTenant, setSelectedTenant] = useState("");
  const tenantId = selectedTenant || tenants?.[0]?.id || "";
  const { data: documents, refetch } = useKbDocuments(tenantId);
  const { data: config } = useTenantConfig(tenantId);
  const qc = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{ chunks: number; embeddings: boolean } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [embeddingDocId, setEmbeddingDocId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasEmbeddingConfig = !!(config?.provider_endpoint && config?.provider_api_key);
  const acceptedTypes = ".txt,.md,.csv,.json,.html,.xml";

  const handleUpload = useCallback(async (file: File) => {
    if (!tenantId) { toast.error("Vui lòng chọn tenant trước"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("File quá lớn (tối đa 20MB)"); return; }

    setUploadStep("reading");
    setUploadProgress(10);
    setUploadError("");
    setUploadResult(null);

    try {
      const content = await file.text();
      if (!content.trim()) throw new Error("File rỗng");
      setUploadProgress(25);

      setUploadStep("uploading");
      const filePath = `${tenantId}/${Date.now()}-${file.name}`;
      const { error: storageError } = await supabase.storage.from("kb-documents").upload(filePath, file);
      if (storageError) console.warn("Storage upload failed (non-blocking):", storageError);
      setUploadProgress(40);

      const { data: doc, error: docError } = await supabase
        .from("kb_documents")
        .insert({ tenant_id: tenantId, name: file.name, file_url: filePath, status: "processing" })
        .select("id")
        .single();
      if (docError) throw new Error(docError.message);
      setUploadProgress(50);

      setUploadStep("chunking");
      setUploadProgress(60);

      const result = await processDocument({ tenantId, documentId: doc.id, content });
      setUploadProgress(100);
      setUploadStep("done");
      setUploadResult({ chunks: result.chunks_created, embeddings: result.embeddings_generated });
      toast.success(`Đã xử lý ${result.chunks_created} chunks`);
      refetch();
    } catch (err: any) {
      console.error("Upload error:", err);
      setUploadStep("error");
      setUploadError(err.message || "Lỗi không xác định");
      toast.error("Upload thất bại: " + (err.message || ""));
    }
  }, [tenantId, refetch]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDelete = async (docId: string) => {
    const { error } = await supabase.from("kb_documents").delete().eq("id", docId);
    if (error) {
      toast.error("Xóa thất bại");
    } else {
      await supabase.from("kb_chunks").delete().eq("document_id", docId);
      toast.success("Đã xóa tài liệu");
      refetch();
    }
  };

  const handleGenerateEmbeddings = async (docId?: string) => {
    if (!hasEmbeddingConfig) {
      toast.error("Chưa cấu hình Embedding Provider. Vào Settings → Embedding để thiết lập.");
      return;
    }
    const targetId = docId || undefined;
    setEmbeddingDocId(docId || "all");
    try {
      const { data, error } = await supabase.functions.invoke("generate-embeddings", {
        body: { tenant_id: tenantId, document_id: targetId },
      });
      if (error) throw error;
      if (data?.needs_config) {
        toast.error(data.error);
        return;
      }
      toast.success(`Đã tạo embeddings cho ${data.embedded} chunks`);
      refetch();
    } catch (err: any) {
      toast.error("Embedding failed: " + (err.message || ""));
    } finally {
      setEmbeddingDocId(null);
    }
  };

  const resetUpload = () => {
    setUploadStep("idle");
    setUploadProgress(0);
    setUploadResult(null);
    setUploadError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const filteredDocs = documents?.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stepLabel: Record<UploadStep, string> = {
    idle: "Chọn file để upload",
    reading: "Đang đọc file...",
    uploading: "Đang upload...",
    chunking: "Đang chunk & embed...",
    done: "Hoàn thành!",
    error: "Lỗi",
  };

  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
            <p className="text-sm text-muted-foreground mt-1">Upload & quản lý tài liệu RAG</p>
          </div>
          <div className="flex items-center gap-3">
            {tenants && tenants.length > 0 && (
              <Select value={tenantId} onValueChange={setSelectedTenant}>
                <SelectTrigger className="w-48 h-9 text-xs">
                  <SelectValue placeholder="Chọn tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Embedding status */}
            {tenantId && (
              <Button
                size="sm"
                variant={hasEmbeddingConfig ? "outline" : "destructive"}
                className="gap-2 text-xs"
                onClick={() => hasEmbeddingConfig ? handleGenerateEmbeddings() : toast.error("Cấu hình Embedding Provider trong Settings → Embedding")}
                disabled={embeddingDocId === "all"}
              >
                {embeddingDocId === "all" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BrainCircuit className="h-3.5 w-3.5" />
                )}
                {hasEmbeddingConfig ? "Generate All Embeddings" : "⚠️ Chưa cấu hình Embedding"}
              </Button>
            )}

            <Dialog open={uploadOpen} onOpenChange={(open) => { setUploadOpen(open); if (!open) resetUpload(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2 glow-primary">
                  <Upload className="h-3.5 w-3.5" />
                  Upload tài liệu
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Upload tài liệu KB</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  {!hasEmbeddingConfig && (
                    <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-xs text-warning">
                      ⚠️ Chưa cấu hình Embedding Provider. File sẽ được chunk nhưng chưa tạo embeddings.
                      Vào <strong>Settings → Embedding</strong> để thiết lập.
                    </div>
                  )}

                  {uploadStep === "idle" && (
                    <div
                      onClick={() => fileRef.current?.click()}
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      <File className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-medium">Kéo thả hoặc click để chọn file</p>
                      <p className="text-xs text-muted-foreground mt-1">Hỗ trợ: .txt, .md, .csv, .json, .html, .xml (tối đa 20MB)</p>
                      <input ref={fileRef} type="file" accept={acceptedTypes} onChange={handleFileChange} className="hidden" />
                    </div>
                  )}

                  {uploadStep !== "idle" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        {uploadStep === "done" ? (
                          <CheckCircle2 className="h-5 w-5 text-success" />
                        ) : uploadStep === "error" ? (
                          <XCircle className="h-5 w-5 text-destructive" />
                        ) : (
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        )}
                        <span className="text-sm font-medium">{stepLabel[uploadStep]}</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                      {uploadResult && (
                        <div className="rounded-lg bg-muted p-3 space-y-1">
                          <p className="text-xs"><strong>Chunks tạo:</strong> {uploadResult.chunks}</p>
                          <p className="text-xs">
                            <strong>Embeddings:</strong>{" "}
                            {uploadResult.embeddings ? "✅ Đã tạo" : (
                              <span>
                                ⚠️ Chưa tạo —{" "}
                                {hasEmbeddingConfig ? (
                                  <button className="text-primary underline" onClick={() => handleGenerateEmbeddings()}>
                                    Generate ngay
                                  </button>
                                ) : "cần cấu hình Embedding Provider"}
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
                      {(uploadStep === "done" || uploadStep === "error") && (
                        <Button variant="outline" size="sm" onClick={resetUpload} className="w-full">
                          Upload file khác
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Tìm tài liệu..." className="pl-9 h-10" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>

        {!tenantId ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Vui lòng tạo tenant trước để quản lý Knowledge Base
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <div className="grid grid-cols-[1fr_80px_100px_100px_120px_100px] gap-4 border-b px-6 py-3 text-xs font-medium text-muted-foreground">
              <span>Tên tài liệu</span>
              <span>Chunks</span>
              <span>Embeddings</span>
              <span>Trạng thái</span>
              <span>Cập nhật</span>
              <span></span>
            </div>
            {(!filteredDocs || filteredDocs.length === 0) && (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                {searchQuery ? "Không tìm thấy tài liệu" : "Chưa có tài liệu nào. Upload file đầu tiên!"}
              </div>
            )}
            {filteredDocs?.map((doc) => (
              <div key={doc.id} className="grid grid-cols-[1fr_80px_100px_100px_120px_100px] gap-4 items-center border-b last:border-0 px-6 py-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                </div>
                <span className="text-sm font-mono text-muted-foreground">{doc.chunk_count || 0}</span>
                <div>
                  {doc.status === "indexed" ? (
                    <Badge variant="default" className="text-[9px]">✅ Done</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={() => handleGenerateEmbeddings(doc.id)}
                      disabled={embeddingDocId === doc.id || !hasEmbeddingConfig}
                    >
                      {embeddingDocId === doc.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Generate
                    </Button>
                  )}
                </div>
                <span className={doc.status === "indexed" ? "text-[11px] text-success font-medium" : "text-[11px] text-warning font-medium"}>
                  {doc.status === "indexed" ? "Indexed" : doc.status === "processing" ? "Processing" : doc.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(doc.updated_at), "dd/MM/yyyy")}
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(doc.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default KnowledgeBase;
