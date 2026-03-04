import AdminLayout from "@/components/layout/AdminLayout";
import { FileText, Upload, Search, Trash2, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const documents = [
  { id: 1, name: "Hướng dẫn sử dụng module Kế toán", chunks: 42, status: "indexed", updatedAt: "2026-03-01" },
  { id: 2, name: "FAQ Công nợ & Thanh toán", chunks: 18, status: "indexed", updatedAt: "2026-02-28" },
  { id: 3, name: "Quy trình báo lỗi kỹ thuật", chunks: 25, status: "processing", updatedAt: "2026-03-04" },
  { id: 4, name: "Hướng dẫn quản lý hợp đồng", chunks: 31, status: "indexed", updatedAt: "2026-02-15" },
];

const KnowledgeBase = () => {
  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
            <p className="text-sm text-muted-foreground mt-1">Quản lý tài liệu RAG cho tenant</p>
          </div>
          <Button size="sm" className="gap-2 glow-primary">
            <Upload className="h-3.5 w-3.5" />
            Upload tài liệu
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Tìm tài liệu..." className="pl-9 h-10" />
        </div>

        <div className="rounded-lg border bg-card">
          <div className="grid grid-cols-[1fr_100px_100px_120px_80px] gap-4 border-b px-6 py-3 text-xs font-medium text-muted-foreground">
            <span>Tên tài liệu</span>
            <span>Chunks</span>
            <span>Trạng thái</span>
            <span>Cập nhật</span>
            <span></span>
          </div>
          {documents.map((doc) => (
            <div key={doc.id} className="grid grid-cols-[1fr_100px_100px_120px_80px] gap-4 items-center border-b last:border-0 px-6 py-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm font-medium truncate">{doc.name}</p>
              </div>
              <span className="text-sm font-mono text-muted-foreground">{doc.chunks}</span>
              <span className={doc.status === "indexed" ? "badge-active" : "badge-pending"}>
                {doc.status === "indexed" ? "Indexed" : "Processing"}
              </span>
              <span className="text-xs text-muted-foreground">{doc.updatedAt}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default KnowledgeBase;
