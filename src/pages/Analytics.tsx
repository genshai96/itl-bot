import AdminLayout from "@/components/layout/AdminLayout";
import StatCard from "@/components/dashboard/StatCard";
import { BarChart3, TrendingUp, MessageSquare, Clock, Loader2 } from "lucide-react";
import { useConversationStats, useToolCallLogs, useHandoffEvents } from "@/hooks/use-data";
import { format } from "date-fns";

const Analytics = () => {
  const { data: stats, isLoading: loadingStats } = useConversationStats();
  const { data: toolLogs, isLoading: loadingTools } = useToolCallLogs();
  const { data: handoffs } = useHandoffEvents();

  const totalConvs = stats?.total || 0;
  const conversations = stats?.conversations || [];

  // Intent distribution
  const intentMap: Record<string, number> = {};
  conversations.forEach((c: any) => {
    const intent = c.intent || "unknown";
    intentMap[intent] = (intentMap[intent] || 0) + 1;
  });
  const intents = Object.entries(intentMap)
    .map(([label, count]) => ({ label, count, pct: totalConvs > 0 ? Math.round((count / totalConvs) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const intentColors: Record<string, string> = {
    how_to_use: "bg-info",
    billing: "bg-warning",
    sales_lookup: "bg-primary",
    bug_report: "bg-destructive",
    unknown: "bg-muted-foreground",
  };

  // Tool stats
  const successTools = toolLogs?.filter((t) => t.status === "success").length || 0;
  const totalTools = toolLogs?.length || 0;
  const toolSuccessRate = totalTools > 0 ? ((successTools / totalTools) * 100).toFixed(1) : "—";

  // Avg confidence
  const confsWithVal = conversations.filter((c: any) => c.confidence != null);
  const avgConf = confsWithVal.length > 0
    ? (confsWithVal.reduce((s: number, c: any) => s + (c.confidence || 0), 0) / confsWithVal.length).toFixed(2)
    : "—";

  const pendingHandoffs = handoffs?.filter((h) => h.status === "pending").length || 0;

  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Phân tích hiệu suất bot và chất lượng support</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Avg. Confidence" value={avgConf} icon={TrendingUp} subtitle="trung bình" />
          <StatCard title="Tool Success Rate" value={`${toolSuccessRate}%`} icon={BarChart3} subtitle={`${totalTools} calls`} />
          <StatCard title="Total Conversations" value={String(totalConvs)} icon={MessageSquare} subtitle="tất cả tenants" />
          <StatCard title="Pending Handoffs" value={String(pendingHandoffs)} icon={Clock} subtitle="chờ xử lý" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Intent distribution */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold mb-4">Phân bố Intent</h3>
            {loadingStats ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : intents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Chưa có dữ liệu</p>
            ) : (
              <div className="space-y-3">
                {intents.map((item) => (
                  <div key={item.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-muted-foreground">{item.label}</span>
                      <span className="font-semibold">{item.pct}% ({item.count})</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${intentColors[item.label] || "bg-primary"} transition-all duration-500`} style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tool Call Logs */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold mb-4">Tool Call Logs (gần nhất)</h3>
            {loadingTools ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (!toolLogs || toolLogs.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">Chưa có tool call logs</p>
            ) : (
              <div className="space-y-3">
                {toolLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${log.status === "success" ? "bg-success" : "bg-destructive"}`} />
                      <span className="text-xs font-mono truncate max-w-[180px]">{log.tool_id}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      {log.latency_ms && <span className="font-mono">{(log.latency_ms / 1000).toFixed(1)}s</span>}
                      <span>{format(new Date(log.created_at), "HH:mm")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default Analytics;
