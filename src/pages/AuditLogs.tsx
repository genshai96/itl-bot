import { useState, useEffect, useMemo } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Search, FileText, Loader2, Download, ChevronLeft, ChevronRight,
  Eye, Copy, Building2, User, Bot, Settings,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenants } from "@/hooks/use-data";
import { useHighestRole, useCurrentUserRoles } from "@/hooks/use-current-roles";
import { format, subDays, startOfDay } from "date-fns";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"];
type DatePreset = "all" | "today" | "7d" | "30d";

// ── Constants ─────────────────────────────────────────────────────────────────

const actionColors: Record<string, string> = {
  // Bot / chat
  chat_response:            "bg-primary/10 text-primary",
  llm_error:                "bg-destructive/10 text-destructive",
  prompt_injection_blocked: "bg-warning/10 text-warning",
  // Handoff
  handoff_created:          "bg-info/10 text-info",
  handoff_assigned:         "bg-info/10 text-info",
  handoff_resolved:         "bg-success/10 text-success",
  handoff_reopened:         "bg-warning/10 text-warning",
  // Auth / user
  user_created:             "bg-success/10 text-success",
  user_deleted:             "bg-destructive/10 text-destructive",
  role_updated:             "bg-warning/10 text-warning",
  password_reset:           "bg-warning/10 text-warning",
  login:                    "bg-muted text-muted-foreground",
  logout:                   "bg-muted text-muted-foreground",
  // Knowledge / config
  kb_document_uploaded:     "bg-primary/10 text-primary",
  kb_document_deleted:      "bg-destructive/10 text-destructive",
  config_updated:           "bg-warning/10 text-warning",
  tenant_created:           "bg-success/10 text-success",
  tenant_deleted:           "bg-destructive/10 text-destructive",
};

const actorIcons: Record<string, React.ElementType> = {
  bot:    Bot,
  user:   User,
  system: Settings,
};

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all",   label: "Tất cả thời gian" },
  { value: "today", label: "Hôm nay" },
  { value: "7d",    label: "7 ngày qua" },
  { value: "30d",   label: "30 ngày qua" },
];

const PAGE_SIZE = 50;
const EXPORT_LIMIT = 5000;

// ── CSV helper ────────────────────────────────────────────────────────────────

/** Properly escape a CSV cell value (double up internal quotes, wrap in quotes) */
function csvCell(value: unknown): string {
  const str = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

// ── Component ─────────────────────────────────────────────────────────────────

const AuditLogs = () => {
  const highestRole = useHighestRole();
  const { data: userRoles } = useCurrentUserRoles();
  const { data: tenants } = useTenants();

  // Multi-tenant isolation: non-system-admins are locked to their own tenant
  const lockedTenantId: string | undefined =
    highestRole === "system_admin"
      ? undefined
      : (userRoles?.find((r) => r.tenant_id)?.tenant_id ?? undefined);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [tenantFilter, setTenantFilter] = useState<string>(lockedTenantId ?? "all");
  const [actorTypeFilter, setActorTypeFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [page, setPage] = useState(0);

  // Debounced search: input state updates immediately, searchTerm lags 300ms
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setSearchTerm(searchInput); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Keep tenant filter in sync if role changes
  useEffect(() => {
    if (lockedTenantId) setTenantFilter(lockedTenantId);
  }, [lockedTenantId]);

  // ── Derived filter values ──────────────────────────────────────────────────
  const fromDate = useMemo((): string | null => {
    if (datePreset === "today") return startOfDay(new Date()).toISOString();
    if (datePreset === "7d")    return subDays(new Date(), 7).toISOString();
    if (datePreset === "30d")   return subDays(new Date(), 30).toISOString();
    return null;
  }, [datePreset]);

  // ── Query builder (reusable fn) ────────────────────────────────────────────
  const buildQuery = (paginated: boolean) => {
    let q = supabase
      .from("audit_logs")
      .select("*", { count: paginated ? "exact" : undefined })
      .order("created_at", { ascending: false });

    // Tenant: locked for non-system-admin OR user-selected for system-admin
    const effectiveTenant = lockedTenantId ?? (tenantFilter !== "all" ? tenantFilter : undefined);
    if (effectiveTenant) q = q.eq("tenant_id", effectiveTenant);

    if (actorTypeFilter !== "all") q = q.eq("actor_type", actorTypeFilter);
    if (fromDate) q = q.gte("created_at", fromDate);

    // Search across action, actor_id, resource_type, resource_id
    if (searchTerm.trim()) {
      q = q.or(
        [
          `action.ilike.%${searchTerm}%`,
          `actor_id.ilike.%${searchTerm}%`,
          `resource_type.ilike.%${searchTerm}%`,
          `resource_id.ilike.%${searchTerm}%`,
        ].join(",")
      );
    }

    if (paginated) {
      q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    } else {
      q = q.limit(EXPORT_LIMIT);
    }

    return q;
  };

  // ── Main paginated query ───────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["audit_logs", tenantFilter, actorTypeFilter, datePreset, searchTerm, page],
    queryFn: async () => {
      const { data, error, count } = await buildQuery(true);
      if (error) throw error;
      return { logs: (data ?? []) as AuditLog[], total: count ?? 0 };
    },
  });

  const logs = data?.logs ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);
  const showTenantCol = highestRole === "system_admin" && tenantFilter === "all";

  // ── Details expand ─────────────────────────────────────────────────────────
  const [detailsLog, setDetailsLog] = useState<AuditLog | null>(null);

  // ── Export all matching records ────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  const exportCSV = async () => {
    setExporting(true);
    try {
      const { data: allData, error } = await buildQuery(false);
      if (error) throw error;
      const rows = (allData ?? []) as AuditLog[];

      const headers = ["timestamp", "action", "actor_type", "actor_id", "tenant_id", "resource_type", "resource_id", "details"];
      const csvRows = rows.map((l) => [
        csvCell(l.created_at),
        csvCell(l.action),
        csvCell(l.actor_type),
        csvCell(l.actor_id),
        csvCell(l.tenant_id),
        csvCell(l.resource_type),
        csvCell(l.resource_id),
        csvCell(l.details),
      ].join(","));

      const csv = [headers.map(csvCell).join(","), ...csvRows].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM for Excel
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã export ${rows.length} records`);
    } catch {
      toast.error("Export thất bại");
    } finally {
      setExporting(false);
    }
  };

  // ── Reset page on filter change ────────────────────────────────────────────
  const handleTenantChange = (v: string) => { setTenantFilter(v); setPage(0); };
  const handleActorTypeChange = (v: string) => { setActorTypeFilter(v); setPage(0); };
  const handleDateChange = (v: DatePreset) => { setDatePreset(v); setPage(0); };

  const hasFilter = searchInput || actorTypeFilter !== "all" || datePreset !== "all" ||
    (highestRole === "system_admin" && tenantFilter !== "all");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="space-y-6 animate-slide-in">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Theo dõi tất cả hoạt động hệ thống
              {data?.total != null && (
                <span className="ml-2 text-xs font-mono text-muted-foreground/60">
                  · {data.total.toLocaleString()} records khớp
                </span>
              )}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-xs"
            onClick={exportCSV}
            disabled={exporting || logs.length === 0}
          >
            {exporting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />
            }
            Export CSV {data?.total ? `(${Math.min(data.total, EXPORT_LIMIT).toLocaleString()})` : ""}
          </Button>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search — debounced, multi-field */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo action, actor ID, resource..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Date range */}
          <Select value={datePreset} onValueChange={(v) => handleDateChange(v as DatePreset)}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Actor type */}
          <Select value={actorTypeFilter} onValueChange={handleActorTypeChange}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue placeholder="Actor type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Tất cả actor</SelectItem>
              <SelectItem value="bot" className="text-xs">🤖 Bot</SelectItem>
              <SelectItem value="user" className="text-xs">👤 User</SelectItem>
              <SelectItem value="system" className="text-xs">⚙️ System</SelectItem>
            </SelectContent>
          </Select>

          {/* Tenant — only for system_admin */}
          {highestRole === "system_admin" && (
            <Select value={tenantFilter} onValueChange={handleTenantChange}>
              <SelectTrigger className="h-9 w-44 text-xs">
                <SelectValue placeholder="Tất cả tenants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Tất cả tenants</SelectItem>
                {tenants?.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Locked tenant badge for non-system-admin */}
          {highestRole !== "system_admin" && lockedTenantId && (
            <div className="flex items-center gap-1.5 h-9 px-3 rounded-md border bg-muted text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              {tenants?.find((t) => t.id === lockedTenantId)?.name ?? "Current tenant"}
            </div>
          )}

          {/* Clear filters */}
          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-9"
              onClick={() => {
                setSearchInput("");
                setActorTypeFilter("all");
                setDatePreset("all");
                if (highestRole === "system_admin") setTenantFilter("all");
                setPage(0);
              }}
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-3 whitespace-nowrap">
                    Thời gian
                  </th>
                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-3">
                    Action
                  </th>
                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-3">
                    Actor
                  </th>
                  {showTenantCol && (
                    <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-3">
                      Tenant
                    </th>
                  )}
                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-3">
                    Resource
                  </th>
                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-3">
                    Chi tiết
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && (
                  <tr>
                    <td colSpan={showTenantCol ? 6 : 5} className="text-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </td>
                  </tr>
                )}

                {!isLoading && logs.length === 0 && (
                  <tr>
                    <td colSpan={showTenantCol ? 6 : 5} className="text-center py-12">
                      <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        {hasFilter ? "Không tìm thấy kết quả phù hợp" : "Chưa có audit logs"}
                      </p>
                    </td>
                  </tr>
                )}

                {logs.map((log) => {
                  const ActorIcon = actorIcons[log.actor_type] ?? User;
                  const tenant = tenants?.find((t) => t.id === log.tenant_id);

                  return (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors group">
                      {/* Timestamp */}
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
                        {format(new Date(log.created_at), "dd/MM HH:mm:ss")}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-mono ${actionColors[log.action] ?? "bg-muted text-muted-foreground"}`}
                        >
                          {log.action}
                        </Badge>
                      </td>

                      {/* Actor: type + id */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <ActorIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <span className="text-xs text-muted-foreground">{log.actor_type}</span>
                            {log.actor_id && (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(log.actor_id!);
                                  toast.success("Đã copy actor ID");
                                }}
                                className="flex items-center gap-1 mt-0.5 group/copy"
                                title={log.actor_id}
                              >
                                <span className="text-[10px] font-mono text-muted-foreground/60 group-hover/copy:text-primary transition-colors">
                                  {log.actor_id.slice(0, 12)}…
                                </span>
                                <Copy className="h-2.5 w-2.5 text-muted-foreground/40 group-hover/copy:text-primary opacity-0 group-hover/copy:opacity-100 transition-all" />
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Tenant column — system_admin only */}
                      {showTenantCol && (
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {tenant ? (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {tenant.name}
                            </span>
                          ) : log.tenant_id ? (
                            <span className="font-mono text-[10px]">{log.tenant_id.slice(0, 8)}</span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      )}

                      {/* Resource */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {log.resource_type ? (
                          <div>
                            <span className="font-medium text-foreground/70">{log.resource_type}</span>
                            {log.resource_id && (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(log.resource_id!);
                                  toast.success("Đã copy resource ID");
                                }}
                                className="flex items-center gap-1 mt-0.5 group/rcopy"
                                title={log.resource_id}
                              >
                                <span className="text-[10px] font-mono text-muted-foreground/60 group-hover/rcopy:text-primary transition-colors">
                                  {log.resource_id.slice(0, 8)}
                                </span>
                                <Copy className="h-2.5 w-2.5 text-muted-foreground/40 group-hover/rcopy:text-primary opacity-0 group-hover/rcopy:opacity-100 transition-all" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>

                      {/* Details — truncated with expand */}
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px]">
                        {log.details ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono truncate text-[10px]">
                              {JSON.stringify(log.details).slice(0, 60)}
                              {JSON.stringify(log.details).length > 60 ? "…" : ""}
                            </span>
                            <button
                              onClick={() => setDetailsLog(log)}
                              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                              title="Xem đầy đủ"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Trang {page + 1} / {totalPages}
                <span className="ml-2 font-mono">· {data?.total.toLocaleString()} records</span>
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {/* Page number chips */}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = totalPages <= 5 ? i : Math.max(0, Math.min(page - 2 + i, totalPages - 5 + i));
                  return (
                    <Button
                      key={p}
                      size="sm"
                      variant={p === page ? "default" : "ghost"}
                      className="h-8 w-8 p-0 text-xs"
                      onClick={() => setPage(p)}
                    >
                      {p + 1}
                    </Button>
                  );
                })}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Details dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!detailsLog} onOpenChange={(open) => !open && setDetailsLog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Badge
                variant="secondary"
                className={`text-[10px] font-mono ${actionColors[detailsLog?.action ?? ""] ?? "bg-muted text-muted-foreground"}`}
              >
                {detailsLog?.action}
              </Badge>
              <span className="text-muted-foreground font-normal font-mono text-xs">
                {detailsLog && format(new Date(detailsLog.created_at), "dd/MM/yyyy HH:mm:ss")}
              </span>
            </DialogTitle>
          </DialogHeader>

          {detailsLog && (
            <div className="space-y-3 pt-1">
              {/* Meta fields */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {[
                  ["Actor type", detailsLog.actor_type],
                  ["Actor ID",   detailsLog.actor_id],
                  ["Resource",   detailsLog.resource_type],
                  ["Resource ID",detailsLog.resource_id],
                  ["Tenant ID",  detailsLog.tenant_id],
                ].map(([lbl, val]) => val && (
                  <div key={lbl}>
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{lbl}</Label>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-xs break-all">{val}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(val); toast.success("Đã copy"); }}
                        className="shrink-0 text-muted-foreground hover:text-primary"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Details JSON */}
              {detailsLog.details && (
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Details</Label>
                  <pre className="mt-1.5 text-[11px] font-mono bg-muted rounded-md p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                    {JSON.stringify(detailsLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AuditLogs;
