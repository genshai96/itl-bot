import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Building2,
  Plus,
  Search,
  Settings,
  FileText,
  MessageSquare,
  Trash2,
  ExternalLink,
  Code2,
  Copy,
  Eye,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive" | "trial";
  kbCount: number;
  convCount: number;
  model: string;
  createdAt: string;
  domain?: string;
}

const mockTenants: Tenant[] = [
  { id: "t-001", name: "Acme Corp", slug: "acme-corp", status: "active", kbCount: 4, convCount: 1284, model: "gpt-4o", createdAt: "2026-01-15", domain: "acme.com" },
  { id: "t-002", name: "TechViet JSC", slug: "techviet", status: "active", kbCount: 2, convCount: 567, model: "gpt-4o-mini", createdAt: "2026-02-01", domain: "techviet.vn" },
  { id: "t-003", name: "SoftPlus", slug: "softplus", status: "trial", kbCount: 1, convCount: 43, model: "gpt-3.5-turbo", createdAt: "2026-03-01" },
  { id: "t-004", name: "DataHub", slug: "datahub", status: "inactive", kbCount: 0, convCount: 0, model: "", createdAt: "2026-02-20" },
];

const statusConfig: Record<string, { label: string; class: string }> = {
  active: { label: "Active", class: "badge-active" },
  trial: { label: "Trial", class: "badge-pending" },
  inactive: { label: "Inactive", class: "badge-closed" },
};

const Tenants = () => {
  const navigate = useNavigate();
  const [tenants] = useState<Tenant[]>(mockTenants);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: "", slug: "", domain: "" });

  const filtered = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Quản lý tenant — mỗi tenant có KB, dữ liệu, model config riêng
            </p>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2 glow-primary">
                <Plus className="h-3.5 w-3.5" />
                Tạo Tenant
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Tạo Tenant mới</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Tên công ty</Label>
                  <Input
                    value={newTenant.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                      setNewTenant({ ...newTenant, name, slug });
                    }}
                    placeholder="VD: Acme Corp"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Slug (ID)</Label>
                  <Input
                    value={newTenant.slug}
                    onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
                    placeholder="acme-corp"
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">Dùng trong URL và embed code</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Domain (tùy chọn)</Label>
                  <Input
                    value={newTenant.domain}
                    onChange={(e) => setNewTenant({ ...newTenant, domain: e.target.value })}
                    placeholder="example.com"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                    Hủy
                  </Button>
                  <Button size="sm" className="glow-primary" onClick={() => setShowCreate(false)}>
                    Tạo tenant
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tenant..."
            className="pl-9 h-10"
          />
        </div>

        {/* Tenant cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((tenant) => (
            <div
              key={tenant.id}
              className="stat-card group cursor-pointer"
              onClick={() => navigate(`/tenants/${tenant.id}`)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                    {tenant.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{tenant.name}</h3>
                    <p className="text-[11px] text-muted-foreground font-mono">{tenant.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={statusConfig[tenant.status]?.class}>
                    {statusConfig[tenant.status]?.label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{tenant.kbCount} KB docs</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>{tenant.convCount} chats</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Code2 className="h-3.5 w-3.5" />
                  <span className="font-mono truncate">{tenant.model || "—"}</span>
                </div>
              </div>

              {tenant.domain && (
                <div className="mt-3 pt-3 border-t flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ExternalLink className="h-3 w-3" />
                  {tenant.domain}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default Tenants;
