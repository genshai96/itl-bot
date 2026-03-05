import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, FileText, Loader2, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenants } from "@/hooks/use-data";
import { format } from "date-fns";

const actionColors: Record<string, string> = {
  chat_response: "bg-primary/10 text-primary",
  llm_error: "bg-destructive/10 text-destructive",
  prompt_injection_blocked: "bg-warning/10 text-warning",
  handoff_created: "bg-info/10 text-info",
};

const AuditLogs = () => {
  const { data: tenants } = useTenants();
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["audit_logs", tenantFilter, searchTerm, page],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (tenantFilter !== "all") query = query.eq("tenant_id", tenantFilter);
      if (searchTerm) query = query.ilike("action", `%${searchTerm}%`);

      const { data, error, count } = await query;
      if (error) throw error;
      return { logs: data, total: count || 0 };
    },
  });

  const logs = data?.logs || [];
  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  const exportCSV = () => {
    if (!logs.length) return;
    const headers = ["timestamp", "action", "actor_type", "resource_type", "resource_id", "details"];
    const rows = logs.map((l) => [
      l.created_at,
      l.action,
      l.actor_type,
      l.resource_type || "",
      l.resource_id || "",
      JSON.stringify(l.details || {}),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="space-y-6 animate-slide-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
            <p className="text-sm text-muted-foreground mt-1">Theo dõi tất cả hoạt động hệ thống</p>
          </div>
          <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
              placeholder="Tìm theo action..."
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={tenantFilter} onValueChange={(v) => { setTenantFilter(v); setPage(0); }}>
            <SelectTrigger className="w-48 h-9 text-xs">
              <SelectValue placeholder="Tất cả tenants" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả tenants</SelectItem>
              {tenants?.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-3">Thời gian</th>
                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-3">Action</th>
                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-3">Actor</th>
                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-3">Resource</th>
                  <th className="text-left text-[11px] font-semibold text-muted-foreground px-4 py-3">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="text-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </td>
                  </tr>
                )}
                {!isLoading && logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-sm text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      Không có audit logs
                    </td>
                  </tr>
                )}
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
                      {format(new Date(log.created_at), "dd/MM HH:mm:ss")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={`text-[10px] ${actionColors[log.action] || ""}`}>
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">{log.actor_type}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.resource_type && (
                        <span className="font-mono">{log.resource_type}/{log.resource_id?.slice(0, 8)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate font-mono">
                      {log.details ? JSON.stringify(log.details).slice(0, 100) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Trang {page + 1} / {totalPages} · {data?.total} logs
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AuditLogs;
