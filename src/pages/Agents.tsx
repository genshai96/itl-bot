import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Shield, Loader2, Trash2, UserPlus, Headset, Mail, Lock, User } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRoles, useDeleteUserRole, useProfiles, useTenants } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const roleLabels: Record<string, string> = {
  system_admin: "System Admin",
  tenant_admin: "Tenant Admin",
  support_lead: "Support Lead",
  support_agent: "Support Operator",
  end_user: "End User",
};

const roleColors: Record<string, string> = {
  system_admin: "bg-destructive/10 text-destructive",
  tenant_admin: "bg-primary/10 text-primary",
  support_lead: "bg-warning/10 text-warning",
  support_agent: "bg-success/10 text-success",
  end_user: "bg-muted text-muted-foreground",
};

const operatorRoles = ["support_agent", "support_lead"];

const Agents = () => {
  const { data: roles, isLoading, refetch } = useUserRoles();
  const { data: tenants } = useTenants();
  const deleteRole = useDeleteUserRole();

  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<"direct" | "invite">("direct");
  const [form, setForm] = useState({ email: "", password: "", displayName: "", role: "support_agent", tenantId: "" });
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!form.email || !form.role || !form.tenantId) {
      toast.error("Vui lòng điền đầy đủ thông tin");
      return;
    }
    if (createMode === "direct" && (!form.password || form.password.length < 6)) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-operator", {
        body: {
          email: form.email,
          password: createMode === "direct" ? form.password : undefined,
          displayName: form.displayName || undefined,
          role: form.role,
          tenantId: form.tenantId,
          mode: createMode,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(createMode === "direct" ? "Đã tạo tài khoản operator!" : "Đã gửi lời mời qua email!");
      setShowCreate(false);
      setForm({ email: "", password: "", displayName: "", role: "support_agent", tenantId: "" });
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Tạo operator thất bại");
    } finally {
      setCreating(false);
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
            <h1 className="text-2xl font-bold tracking-tight">Operators</h1>
            <p className="text-sm text-muted-foreground mt-1">Quản lý nhân viên hỗ trợ và phân quyền</p>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2 glow-primary">
                <UserPlus className="h-3.5 w-3.5" />
                Tạo Operator
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Tạo tài khoản Operator</DialogTitle>
              </DialogHeader>
              <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as "direct" | "invite")} className="pt-2">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="direct" className="text-xs">Tạo trực tiếp</TabsTrigger>
                  <TabsTrigger value="invite" className="text-xs">Mời qua email</TabsTrigger>
                </TabsList>

                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Tenant</Label>
                    <Select value={form.tenantId} onValueChange={(v) => setForm({ ...form, tenantId: v })}>
                      <SelectTrigger><SelectValue placeholder="Chọn tenant..." /></SelectTrigger>
                      <SelectContent>
                        {tenants?.map((t) => (
                          <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="operator@company.com" className="pl-9 h-9 text-xs" type="email" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Tên hiển thị</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                        placeholder="Nguyễn Văn A" className="pl-9 h-9 text-xs" />
                    </div>
                  </div>

                  <TabsContent value="direct" className="mt-0 space-y-2">
                    <Label className="text-xs font-medium">Mật khẩu</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder="Tối thiểu 6 ký tự" className="pl-9 h-9 text-xs" type="password" minLength={6} />
                    </div>
                  </TabsContent>
                  <TabsContent value="invite" className="mt-0">
                    <p className="text-[11px] text-muted-foreground bg-muted p-3 rounded-lg">
                      Hệ thống sẽ tạo tài khoản và gửi email đặt mật khẩu cho operator. Operator đăng nhập tại <strong>/staff-login</strong>.
                    </p>
                  </TabsContent>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Role</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {operatorRoles.map((k) => (
                          <SelectItem key={k} value={k} className="text-xs">{roleLabels[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Hủy</Button>
                    <Button size="sm" className="glow-primary" onClick={handleCreate} disabled={creating}>
                      {creating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                      {createMode === "direct" ? "Tạo tài khoản" : "Gửi lời mời"}
                    </Button>
                  </div>
                </div>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (!roles || roles.length === 0) ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Chưa có operator nào được gán role.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roles.map((role) => {
              const profile = role.profiles as any;
              const tenant = tenants?.find((t) => t.id === role.tenant_id);
              return (
                <div key={role.id} className="stat-card flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                    {(profile?.display_name || "?").split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{profile?.display_name || role.user_id.slice(0, 8)}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[role.role] || "bg-muted text-muted-foreground"}`}>
                        <Shield className="h-3 w-3" />
                        {roleLabels[role.role] || role.role}
                      </span>
                      {tenant && (
                        <span className="text-[10px] text-muted-foreground font-mono">@ {tenant.name}</span>
                      )}
                      {!role.tenant_id && (
                        <span className="text-[10px] text-muted-foreground font-mono">(Global)</span>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(role.id)}>
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
