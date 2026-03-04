import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Shield, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUserRoles, useCreateUserRole, useDeleteUserRole, useProfiles, useTenants } from "@/hooks/use-data";
import { toast } from "sonner";

const roleLabels: Record<string, string> = {
  system_admin: "System Admin",
  tenant_admin: "Tenant Admin",
  support_lead: "Support Lead",
  support_agent: "Support Agent",
  end_user: "End User",
};

const roleColors: Record<string, string> = {
  system_admin: "bg-destructive/10 text-destructive",
  tenant_admin: "bg-primary/10 text-primary",
  support_lead: "bg-warning/10 text-warning",
  support_agent: "bg-success/10 text-success",
  end_user: "bg-muted text-muted-foreground",
};

const Agents = () => {
  const { data: roles, isLoading } = useUserRoles();
  const { data: profiles } = useProfiles();
  const { data: tenants } = useTenants();
  const createRole = useCreateUserRole();
  const deleteRole = useDeleteUserRole();

  const [showAssign, setShowAssign] = useState(false);
  const [newRole, setNewRole] = useState({ userId: "", role: "support_agent", tenantId: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleAssign = async () => {
    if (!newRole.userId || !newRole.role) {
      toast.error("Vui lòng chọn user và role");
      return;
    }
    try {
      await createRole.mutateAsync({
        user_id: newRole.userId,
        role: newRole.role,
        tenant_id: newRole.tenantId || null,
      });
      toast.success("Đã gán role thành công!");
      setShowAssign(false);
      setNewRole({ userId: "", role: "support_agent", tenantId: "" });
    } catch (err: any) {
      toast.error(err.message || "Gán role thất bại");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteRole.mutateAsync(deleteId);
      toast.success("Đã xóa role");
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
            <h1 className="text-2xl font-bold tracking-tight">Agents & Roles</h1>
            <p className="text-sm text-muted-foreground mt-1">Quản lý support agents và phân quyền</p>
          </div>
          <Dialog open={showAssign} onOpenChange={setShowAssign}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2 glow-primary">
                <UserPlus className="h-3.5 w-3.5" />
                Gán Role
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Gán Role cho User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">User</Label>
                  <Select value={newRole.userId} onValueChange={(v) => setNewRole({ ...newRole, userId: v })}>
                    <SelectTrigger><SelectValue placeholder="Chọn user..." /></SelectTrigger>
                    <SelectContent>
                      {profiles?.map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id} className="text-xs">
                          {p.display_name || p.user_id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Role</Label>
                  <Select value={newRole.role} onValueChange={(v) => setNewRole({ ...newRole, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(roleLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Tenant (bỏ trống cho system_admin)</Label>
                  <Select value={newRole.tenantId} onValueChange={(v) => setNewRole({ ...newRole, tenantId: v })}>
                    <SelectTrigger><SelectValue placeholder="Chọn tenant..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none" className="text-xs">— Không chọn (System level) —</SelectItem>
                      {tenants?.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAssign(false)}>Hủy</Button>
                  <Button size="sm" className="glow-primary" onClick={handleAssign} disabled={createRole.isPending}>
                    {createRole.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    Gán role
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (!roles || roles.length === 0) ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Chưa có agent nào được gán role.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roles.map((role) => {
              const profile = role.profiles as any;
              const tenant = tenants?.find((t) => t.id === role.tenant_id);
              return (
                <div key={role.id} className="stat-card flex items-center gap-4">
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                      {(profile?.display_name || "?").split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{profile?.display_name || role.user_id.slice(0, 8)}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[role.role] || "bg-muted text-muted-foreground"}`}>
                        <Shield className="h-3 w-3" />
                        {roleLabels[role.role] || role.role}
                      </span>
                      {tenant && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          @ {tenant.name}
                        </span>
                      )}
                      {!role.tenant_id && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          (Global)
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(role.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa role?</AlertDialogTitle>
            <AlertDialogDescription>User sẽ mất quyền truy cập liên quan đến role này.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default Agents;
