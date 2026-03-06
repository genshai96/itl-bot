import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import {
  Shield, Loader2, Trash2, UserPlus, Mail, Lock, User,
  MoreHorizontal, RefreshCw, Edit2, Headset, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useUserRoles, useTenants } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

const roleLabels: Record<string, string> = {
  system_admin: "System Admin",
  tenant_admin: "Tenant Admin",
  support_lead: "Support Lead",
  support_agent: "Support Operator",
  end_user: "End User",
};

const roleColors: Record<string, string> = {
  system_admin: "bg-destructive/10 text-destructive border-destructive/20",
  tenant_admin: "bg-primary/10 text-primary border-primary/20",
  support_lead: "bg-warning/10 text-warning border-warning/20",
  support_agent: "bg-success/10 text-success border-success/20",
  end_user: "bg-muted text-muted-foreground border-border",
};

const operatorRoles = ["support_agent", "support_lead"];

const Agents = () => {
  const { data: roles, isLoading, refetch } = useUserRoles();
  const { data: tenants } = useTenants();

  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<"direct" | "invite">("direct");
  const [form, setForm] = useState({ email: "", password: "", displayName: "", role: "support_agent", tenantId: "" });
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editingRole, setEditingRole] = useState<{ id: string; role: string; tenantId: string | null } | null>(null);
  const [newRoleValue, setNewRoleValue] = useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; userId: string; name: string } | null>(null);
  const [deleteUser, setDeleteUser] = useState(false);

  // Loading states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const invokeOperator = async (body: any) => {
    const { data, error } = await supabase.functions.invoke("create-operator", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

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
      await invokeOperator({
        action: "create",
        email: form.email,
        password: createMode === "direct" ? form.password : undefined,
        displayName: form.displayName || undefined,
        role: form.role,
        tenantId: form.tenantId,
        mode: createMode,
      });
      toast.success(createMode === "direct" ? "Đã tạo tài khoản operator!" : "Đã gửi lời mời!");
      setShowCreate(false);
      setForm({ email: "", password: "", displayName: "", role: "support_agent", tenantId: "" });
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Tạo operator thất bại");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!editingRole || !newRoleValue) return;
    setActionLoading(editingRole.id);
    try {
      await invokeOperator({
        action: "update_role",
        roleId: editingRole.id,
        newRole: newRoleValue,
        tenantId: editingRole.tenantId,
      });
      toast.success("Đã cập nhật role!");
      setEditingRole(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Cập nhật thất bại");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendInvite = async (userId: string, tenantId: string | null) => {
    setActionLoading(userId);
    try {
      await invokeOperator({
        action: "resend_invite",
        userId,
        tenantId,
      });
      toast.success("Đã gửi lại lời mời!");
    } catch (err: any) {
      toast.error(err.message || "Gửi lại thất bại");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(deleteTarget.id);
    try {
      await invokeOperator({
        action: "delete",
        roleId: deleteTarget.id,
        userId: deleteTarget.userId,
        deleteUser,
        tenantId: roles?.find((r) => r.id === deleteTarget.id)?.tenant_id,
      });
      toast.success(deleteUser ? "Đã xóa operator và tài khoản!" : "Đã xóa role!");
      setDeleteTarget(null);
      setDeleteUser(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Xóa thất bại");
    } finally {
      setActionLoading(null);
    }
  };

  const operatorCount = roles?.filter((r) => operatorRoles.includes(r.role)).length || 0;
  const totalCount = roles?.length || 0;

  return (
    <AdminLayout>
      <div className="space-y-6 animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Operators</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {operatorCount} operator · {totalCount} roles tổng
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
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
                      <Label className="text-xs font-medium">Tenant *</Label>
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
                      <Label className="text-xs font-medium">Email *</Label>
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
                      <Label className="text-xs font-medium">Mật khẩu *</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                          placeholder="Tối thiểu 6 ký tự" className="pl-9 h-9 text-xs" type="password" minLength={6} />
                      </div>
                    </TabsContent>
                    <TabsContent value="invite" className="mt-0">
                      <div className="text-[11px] text-muted-foreground bg-muted p-3 rounded-lg space-y-1">
                        <p>Hệ thống sẽ tạo tài khoản và gửi email mời.</p>
                        <p>Operator đăng nhập tại <strong>/staff-login</strong> sau khi đặt mật khẩu.</p>
                      </div>
                    </TabsContent>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Role *</Label>
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
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (!roles || roles.length === 0) ? (
          <div className="text-center py-16">
            <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Chưa có operator nào.</p>
            <p className="text-xs text-muted-foreground mt-1">Bấm "Tạo Operator" để thêm nhân viên hỗ trợ.</p>
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {roles.map((role) => {
              const profile = role.profiles as any;
              const tenant = tenants?.find((t) => t.id === role.tenant_id);
              const displayName = profile?.display_name || role.user_id.slice(0, 8);
              const initials = displayName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
              const isOperator = operatorRoles.includes(role.role);

              return (
                <div key={role.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-semibold shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{displayName}</p>
                      {isOperator && (
                        <Headset className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium border ${roleColors[role.role] || "bg-muted text-muted-foreground border-border"}`}>
                        <Shield className="h-2.5 w-2.5" />
                        {roleLabels[role.role] || role.role}
                      </span>
                      {tenant && (
                        <span className="text-[10px] text-muted-foreground">@ {tenant.name}</span>
                      )}
                      {!role.tenant_id && (
                        <span className="text-[10px] text-muted-foreground">(Global)</span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground shrink-0">
                    {format(new Date(role.created_at), "dd/MM/yyyy")}
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingRole({ id: role.id, role: role.role, tenantId: role.tenant_id });
                          setNewRoleValue(role.role);
                        }}
                        className="text-xs gap-2"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Đổi Role
                      </DropdownMenuItem>
                      {isOperator && (
                        <DropdownMenuItem
                          onClick={() => handleResendInvite(role.user_id, role.tenant_id)}
                          disabled={actionLoading === role.user_id}
                          className="text-xs gap-2"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${actionLoading === role.user_id ? "animate-spin" : ""}`} />
                          Gửi lại lời mời
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget({ id: role.id, userId: role.user_id, name: displayName })}
                        className="text-xs gap-2 text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Xóa
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Role Dialog */}
      <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Đổi Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Select value={newRoleValue} onValueChange={setNewRoleValue}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(roleLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingRole(null)}>Hủy</Button>
              <Button size="sm" onClick={handleUpdateRole} disabled={actionLoading === editingRole?.id}>
                {actionLoading === editingRole?.id && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Lưu
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteUser(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>User sẽ mất quyền truy cập liên quan đến role này.</p>
              <div className="flex items-center gap-2 pt-2">
                <Checkbox
                  id="delete-user"
                  checked={deleteUser}
                  onCheckedChange={(c) => setDeleteUser(c === true)}
                />
                <label htmlFor="delete-user" className="text-xs cursor-pointer">
                  Xóa luôn tài khoản (nếu không còn role nào khác)
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actionLoading === deleteTarget?.id}
            >
              {actionLoading === deleteTarget?.id && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default Agents;
