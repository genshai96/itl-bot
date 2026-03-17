import { useState, useMemo } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import {
  Shield, Loader2, Trash2, UserPlus, Mail, Lock, User,
  MoreHorizontal, RefreshCw, Edit2, Headset, Users, Search,
  Copy, KeyRound, Building2,
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useUserRoles, useTenants, type AppRole, type UserRoleWithProfile } from "@/hooks/use-data";
import { useHighestRole, useCurrentUserRoles } from "@/hooks/use-current-roles";
import { supabase } from "@/integrations/supabase/client";
import { assertEdgeFunctionSuccess } from "@/lib/edge-functions";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Role config ───────────────────────────────────────────────────────────────

const roleLabels: Record<AppRole, string> = {
  system_admin:  "System Admin",
  tenant_admin:  "Tenant Admin",
  support_lead:  "Support Lead",
  support_agent: "Support Operator",
  end_user:      "End User",
};

const roleColors: Record<AppRole, string> = {
  system_admin:  "bg-destructive/10 text-destructive border-destructive/20",
  tenant_admin:  "bg-primary/10 text-primary border-primary/20",
  support_lead:  "bg-warning/10 text-warning border-warning/20",
  support_agent: "bg-success/10 text-success border-success/20",
  end_user:      "bg-muted text-muted-foreground border-border",
};

/** Lower number = higher privilege */
const rolePriority: Record<AppRole, number> = {
  system_admin:  0,
  tenant_admin:  1,
  support_lead:  2,
  support_agent: 3,
  end_user:      4,
};

/** True if `actor` can manage (edit/delete/create) `target` */
function canManage(actor: AppRole | null, target: AppRole): boolean {
  if (!actor) return false;
  return rolePriority[actor] < rolePriority[target];
}

/** Roles that `actor` is allowed to assign (all roles strictly below their own) */
function assignableRoles(actor: AppRole | null): AppRole[] {
  if (!actor) return [];
  const myLevel = rolePriority[actor];
  return (Object.keys(rolePriority) as AppRole[]).filter(
    (r) => rolePriority[r] > myLevel && r !== "end_user"
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const Agents = () => {
  const highestRole = useHighestRole();
  const { data: userRoles } = useCurrentUserRoles();

  // Multi-tenant isolation: system_admin sees all, others filter by their tenant
  const tenantFilter: string | undefined =
    highestRole === "system_admin"
      ? undefined
      : (userRoles?.find((r) => r.tenant_id)?.tenant_id ?? undefined);

  const { data: roles, isLoading, refetch } = useUserRoles(tenantFilter);
  const { data: tenants } = useTenants();

  // ── Create state ────────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<"direct" | "invite">("direct");
  const [form, setForm] = useState({
    email: "", password: "", displayName: "",
    role: "support_agent" as AppRole,
    tenantId: tenantFilter ?? "",
  });
  const [creating, setCreating] = useState(false);

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [editingRole, setEditingRole] = useState<UserRoleWithProfile | null>(null);
  const [newRoleValue, setNewRoleValue] = useState<AppRole>("support_agent");

  // ── Delete state ────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; userId: string; name: string } | null>(null);
  const [deleteUser, setDeleteUser] = useState(false);

  // ── Filter / search state ───────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<AppRole | "all">("all");
  const [filterTenant, setFilterTenant] = useState<string | "all">("all");

  // ── Per-row loading ─────────────────────────────────────────────────────────
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Edge function helper ────────────────────────────────────────────────────
  const invokeOperator = async (body: Record<string, unknown>) => {
    return assertEdgeFunctionSuccess(await supabase.functions.invoke("create-operator", { body }));
  };

  // ── CRUD handlers ───────────────────────────────────────────────────────────

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
      setForm({ email: "", password: "", displayName: "", role: "support_agent", tenantId: tenantFilter ?? "" });
      refetch();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Tạo operator thất bại");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!editingRole || !newRoleValue) return;
    // Guard: cannot promote to same or higher level
    if (!canManage(highestRole, newRoleValue)) {
      toast.error("Bạn không có quyền gán role này");
      return;
    }
    setActionLoading(editingRole.id);
    try {
      await invokeOperator({
        action: "update_role",
        roleId: editingRole.id,
        newRole: newRoleValue,
        tenantId: editingRole.tenant_id,
      });
      toast.success("Đã cập nhật role!");
      setEditingRole(null);
      refetch();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Cập nhật thất bại");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendInvite = async (userId: string, tenantId: string | null) => {
    setActionLoading(userId + "-invite");
    try {
      await invokeOperator({ action: "resend_invite", userId, tenantId });
      toast.success("Đã gửi lại lời mời!");
    } catch (err: unknown) {
      toast.error((err as Error).message || "Gửi lại thất bại");
    } finally {
      setActionLoading(null);
    }
  };

  /** Send password-reset email via edge function */
  const handleResetPassword = async (userId: string, displayName: string, tenantId: string | null) => {
    setActionLoading(userId + "-reset");
    try {
      await invokeOperator({ action: "reset_password", userId, tenantId });
      toast.success(`Đã gửi email đặt lại mật khẩu cho ${displayName}`);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Gửi reset password thất bại");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(deleteTarget.id + "-delete");
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
    } catch (err: unknown) {
      toast.error((err as Error).message || "Xóa thất bại");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  const filteredRoles = useMemo(() => {
    return (roles ?? []).filter((r) => {
      if (filterRole !== "all" && r.role !== filterRole) return false;
      if (filterTenant !== "all" && r.tenant_id !== filterTenant) return false;
      if (search.trim()) {
        const displayName = r.profiles?.display_name ?? "";
        const uid = r.user_id;
        const needle = search.toLowerCase();
        if (!displayName.toLowerCase().includes(needle) && !uid.toLowerCase().includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [roles, filterRole, filterTenant, search]);

  const operatorCount = roles?.filter((r) => ["support_agent", "support_lead"].includes(r.role)).length ?? 0;
  const creatableRoles = assignableRoles(highestRole);

  function getInitials(name: string) {
    return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "?";
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="space-y-6 animate-slide-in">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Operators</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {operatorCount} operator · {roles?.length ?? 0} roles tổng
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>

            {/* Create dialog — only if current user can assign at least 1 role */}
            {creatableRoles.length > 0 && (
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
                  <Tabs
                    value={createMode}
                    onValueChange={(v) => setCreateMode(v as "direct" | "invite")}
                    className="pt-2"
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="direct" className="text-xs">Tạo trực tiếp</TabsTrigger>
                      <TabsTrigger value="invite" className="text-xs">Mời qua email</TabsTrigger>
                    </TabsList>

                    <div className="space-y-4 pt-4">
                      {/* Tenant — locked for non-system-admins */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Tenant *</Label>
                        {highestRole === "system_admin" ? (
                          <Select
                            value={form.tenantId}
                            onValueChange={(v) => setForm({ ...form, tenantId: v })}
                          >
                            <SelectTrigger><SelectValue placeholder="Chọn tenant..." /></SelectTrigger>
                            <SelectContent>
                              {tenants?.map((t) => (
                                <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5" />
                            {tenants?.find((t) => t.id === tenantFilter)?.name ?? "Current tenant"}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Email *</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            placeholder="operator@company.com"
                            className="pl-9 h-9 text-xs"
                            type="email"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Tên hiển thị</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            value={form.displayName}
                            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                            placeholder="Nguyễn Văn A"
                            className="pl-9 h-9 text-xs"
                          />
                        </div>
                      </div>

                      <TabsContent value="direct" className="mt-0 space-y-2">
                        <Label className="text-xs font-medium">Mật khẩu *</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            placeholder="Tối thiểu 6 ký tự"
                            className="pl-9 h-9 text-xs"
                            type="password"
                            minLength={6}
                          />
                        </div>
                      </TabsContent>

                      <TabsContent value="invite" className="mt-0">
                        <div className="text-[11px] text-muted-foreground bg-muted p-3 rounded-lg space-y-1">
                          <p>Hệ thống sẽ tạo tài khoản và gửi email mời.</p>
                          <p>Operator đăng nhập tại <strong>/staff-login</strong> sau khi đặt mật khẩu.</p>
                        </div>
                      </TabsContent>

                      {/* Role — scoped to what current user can assign */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Role *</Label>
                        <Select
                          value={form.role}
                          onValueChange={(v) => setForm({ ...form, role: v as AppRole })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {creatableRoles.map((k) => (
                              <SelectItem key={k} value={k} className="text-xs">
                                {roleLabels[k]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                          Hủy
                        </Button>
                        <Button size="sm" className="glow-primary" onClick={handleCreate} disabled={creating}>
                          {creating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                          {createMode === "direct" ? "Tạo tài khoản" : "Gửi lời mời"}
                        </Button>
                      </div>
                    </div>
                  </Tabs>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* ── Search + filters ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, user ID..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Role filter */}
          <Select value={filterRole} onValueChange={(v) => setFilterRole(v as AppRole | "all")}>
            <SelectTrigger className="h-9 w-44 text-xs">
              <SelectValue placeholder="Lọc role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Tất cả role</SelectItem>
              {(Object.keys(roleLabels) as AppRole[]).map((r) => (
                <SelectItem key={r} value={r} className="text-xs">{roleLabels[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tenant filter — only for system_admin */}
          {highestRole === "system_admin" && (
            <Select value={filterTenant} onValueChange={setFilterTenant}>
              <SelectTrigger className="h-9 w-44 text-xs">
                <SelectValue placeholder="Lọc tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Tất cả tenant</SelectItem>
                {tenants?.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(search || filterRole !== "all" || filterTenant !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-9"
              onClick={() => { setSearch(""); setFilterRole("all"); setFilterTenant("all"); }}
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>

        {/* ── Operator list ─────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredRoles.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {search || filterRole !== "all" || filterTenant !== "all"
                ? "Không tìm thấy kết quả phù hợp."
                : "Chưa có operator nào."}
            </p>
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {filteredRoles.map((role) => {
              const displayName = role.profiles?.display_name || "Unnamed";
              const initials = getInitials(displayName);
              const tenant = tenants?.find((t) => t.id === role.tenant_id);
              const isRowLoading = (key: string) => actionLoading === role.id + key || actionLoading === role.user_id + key;
              const targetRole = role.role as AppRole;
              const manageable = canManage(highestRole, targetRole);

              return (
                <div
                  key={role.id}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  {/* Avatar */}
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-semibold shrink-0 uppercase">
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{displayName}</p>
                      {["support_agent", "support_lead"].includes(role.role) && (
                        <Headset className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium border ${roleColors[targetRole] ?? "bg-muted text-muted-foreground border-border"}`}
                      >
                        <Shield className="h-2.5 w-2.5" />
                        {roleLabels[targetRole] ?? role.role}
                      </span>
                      {tenant ? (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          {tenant.name}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">(Global)</span>
                      )}
                    </div>
                    {/* User ID as secondary info */}
                    <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 truncate">
                      {role.user_id}
                    </p>
                  </div>

                  {/* Created date */}
                  <div className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
                    {format(new Date(role.created_at), "dd/MM/yyyy")}
                  </div>

                  {/* Actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground pb-1">
                        {displayName}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />

                      {/* Copy user ID */}
                      <DropdownMenuItem
                        onClick={() => {
                          navigator.clipboard.writeText(role.user_id);
                          toast.success("Đã copy user ID");
                        }}
                        className="text-xs gap-2"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy User ID
                      </DropdownMenuItem>

                      {/* Edit role — only if manageable */}
                      {manageable && (
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingRole(role);
                            setNewRoleValue(targetRole);
                          }}
                          className="text-xs gap-2"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          Đổi Role
                        </DropdownMenuItem>
                      )}

                      {/* Resend invite */}
                      {manageable && ["support_agent", "support_lead", "tenant_admin"].includes(role.role) && (
                        <DropdownMenuItem
                          onClick={() => handleResendInvite(role.user_id, role.tenant_id)}
                          disabled={isRowLoading("-invite")}
                          className="text-xs gap-2"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isRowLoading("-invite") ? "animate-spin" : ""}`} />
                          Gửi lại lời mời
                        </DropdownMenuItem>
                      )}

                      {/* Reset password — only manageable rows */}
                      {manageable && (
                        <DropdownMenuItem
                          onClick={() => handleResetPassword(role.user_id, displayName, role.tenant_id)}
                          disabled={isRowLoading("-reset")}
                          className="text-xs gap-2"
                        >
                          <KeyRound className={`h-3.5 w-3.5 ${isRowLoading("-reset") ? "animate-spin" : ""}`} />
                          Reset Password
                        </DropdownMenuItem>
                      )}

                      {/* Delete — only manageable rows */}
                      {manageable && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget({ id: role.id, userId: role.user_id, name: displayName })}
                            className="text-xs gap-2 text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Xóa
                          </DropdownMenuItem>
                        </>
                      )}

                      {/* If nothing manageable: show hint */}
                      {!manageable && (
                        <DropdownMenuItem disabled className="text-xs text-muted-foreground gap-2">
                          <Shield className="h-3.5 w-3.5" />
                          Không có quyền quản lý
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Edit Role Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Đổi Role — {editingRole?.profiles?.display_name || "Unnamed"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs">Role hiện tại</Label>
              <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border ${roleColors[editingRole?.role as AppRole] ?? ""}`}>
                <Shield className="h-3 w-3" />
                {roleLabels[editingRole?.role as AppRole] ?? editingRole?.role}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Role mới *</Label>
              <Select value={newRoleValue} onValueChange={(v) => setNewRoleValue(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {/* Only show roles the current user can assign */}
                  {assignableRoles(highestRole).map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">{roleLabels[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditingRole(null)}>Hủy</Button>
              <Button
                size="sm"
                onClick={handleUpdateRole}
                disabled={actionLoading === editingRole?.id || newRoleValue === editingRole?.role}
              >
                {actionLoading === editingRole?.id && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                )}
                Lưu thay đổi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ─────────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteUser(false); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>User sẽ mất quyền truy cập liên quan đến role này.</p>
                <div className="flex items-start gap-2 pt-1">
                  <Checkbox
                    id="delete-user"
                    checked={deleteUser}
                    onCheckedChange={(c) => setDeleteUser(c === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="delete-user" className="text-xs cursor-pointer leading-relaxed">
                    Xóa luôn tài khoản Auth (nếu user không còn role nào khác)
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actionLoading === deleteTarget?.id + "-delete"}
            >
              {actionLoading === deleteTarget?.id + "-delete" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              )}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default Agents;
