import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, ChevronRight, ExternalLink, Loader2, Pencil, Trash2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { useTenants, useCreateTenant, useUpdateTenant, useDeleteTenant } from "@/hooks/use-data";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; class: string }> = {
  active: { label: "Active", class: "badge-active" },
  trial: { label: "Trial", class: "badge-pending" },
  inactive: { label: "Inactive", class: "badge-closed" },
};

const Tenants = () => {
  const navigate = useNavigate();
  const { data: tenants, isLoading } = useTenants();
  const createTenant = useCreateTenant();
  const updateTenant = useUpdateTenant();
  const deleteTenant = useDeleteTenant();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: "", slug: "", domain: "" });

  // Edit state
  const [editTenant, setEditTenant] = useState<{ id: string; name: string; domain: string; status: string } | null>(null);
  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = (tenants || []).filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newTenant.name.trim() || !newTenant.slug.trim()) {
      toast.error("Tên và slug không được để trống");
      return;
    }
    try {
      await createTenant.mutateAsync({
        name: newTenant.name.trim(),
        slug: newTenant.slug.trim(),
        domain: newTenant.domain.trim() || null,
      });
      toast.success("Tạo tenant thành công!");
      setShowCreate(false);
      setNewTenant({ name: "", slug: "", domain: "" });
    } catch (err: any) {
      toast.error(err.message || "Tạo tenant thất bại");
    }
  };

  const handleUpdate = async () => {
    if (!editTenant) return;
    try {
      await updateTenant.mutateAsync({
        id: editTenant.id,
        updates: {
          name: editTenant.name.trim(),
          domain: editTenant.domain.trim() || null,
          status: editTenant.status,
        },
      });
      toast.success("Cập nhật thành công!");
      setEditTenant(null);
    } catch (err: any) {
      toast.error(err.message || "Cập nhật thất bại");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTenant.mutateAsync(deleteId);
      toast.success("Đã xóa tenant");
      setDeleteId(null);
    } catch (err: any) {
      toast.error(err.message || "Xóa thất bại");
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
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
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Slug (ID)</Label>
                  <Input
                    value={newTenant.slug}
                    onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
                    placeholder="acme-corp"
                    className="font-mono text-sm"
                    maxLength={50}
                  />
                  <p className="text-[11px] text-muted-foreground">Dùng trong URL và embed code</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Domain (tùy chọn)</Label>
                  <Input
                    value={newTenant.domain}
                    onChange={(e) => setNewTenant({ ...newTenant, domain: e.target.value })}
                    placeholder="example.com"
                    maxLength={255}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Hủy</Button>
                  <Button size="sm" className="glow-primary" onClick={handleCreate} disabled={createTenant.isPending}>
                    {createTenant.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Tạo tenant
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tenant..." className="pl-9 h-10" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            {search ? "Không tìm thấy tenant" : "Chưa có tenant nào. Tạo tenant đầu tiên!"}
          </div>
        ) : (
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
                      {tenant.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{tenant.name}</h3>
                      <p className="text-[11px] text-muted-foreground font-mono">{tenant.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={statusConfig[tenant.status]?.class || "badge-active"}>
                      {statusConfig[tenant.status]?.label || tenant.status}
                    </span>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); setEditTenant({ id: tenant.id, name: tenant.name, domain: tenant.domain || "", status: tenant.status }); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(tenant.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>

                {tenant.domain && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <ExternalLink className="h-3 w-3" />
                    {tenant.domain}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editTenant} onOpenChange={(open) => !open && setEditTenant(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa Tenant</DialogTitle>
          </DialogHeader>
          {editTenant && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Tên</Label>
                <Input value={editTenant.name} onChange={(e) => setEditTenant({ ...editTenant, name: e.target.value })} maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Domain</Label>
                <Input value={editTenant.domain} onChange={(e) => setEditTenant({ ...editTenant, domain: e.target.value })} maxLength={255} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Trạng thái</Label>
                <Select value={editTenant.status} onValueChange={(v) => setEditTenant({ ...editTenant, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditTenant(null)}>Hủy</Button>
                <Button size="sm" className="glow-primary" onClick={handleUpdate} disabled={updateTenant.isPending}>
                  {updateTenant.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Lưu
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể hoàn tác. Tất cả dữ liệu liên quan (conversations, KB, configs) sẽ bị xóa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteTenant.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default Tenants;
