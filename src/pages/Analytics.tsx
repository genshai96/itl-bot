import AdminLayout from "@/components/layout/AdminLayout";
import StatCard from "@/components/dashboard/StatCard";
import { BarChart3, TrendingUp, MessageSquare, Clock } from "lucide-react";

const Analytics = () => {
  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Phân tích hiệu suất bot và chất lượng support</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Intent Accuracy" value="91.3%" change="+1.2%" changeType="positive" icon={TrendingUp} subtitle="30 ngày qua" />
          <StatCard title="Tool Success Rate" value="98.7%" change="+0.3%" changeType="positive" icon={BarChart3} subtitle="30 ngày qua" />
          <StatCard title="Avg. Messages/Conv" value="4.2" change="-0.5" changeType="positive" icon={MessageSquare} subtitle="giảm = tốt" />
          <StatCard title="CSAT Score" value="4.3/5" change="+0.2" changeType="positive" icon={Clock} subtitle="từ feedback" />
        </div>

        {/* Intent distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold mb-4">Phân bố Intent (7 ngày)</h3>
            <div className="space-y-3">
              {[
                { label: "how_to_use", pct: 42, color: "bg-info" },
                { label: "billing_receivable", pct: 28, color: "bg-warning" },
                { label: "sales_lookup", pct: 15, color: "bg-primary" },
                { label: "bug_report", pct: 10, color: "bg-destructive" },
                { label: "other", pct: 5, color: "bg-muted-foreground" },
              ].map((item) => (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">{item.label}</span>
                    <span className="font-semibold">{item.pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${item.color} transition-all duration-500`} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold mb-4">Tool Call Logs (gần nhất)</h3>
            <div className="space-y-3">
              {[
                { tool: "check_receivable_by_month", status: "success", latency: "1.2s", time: "14:25" },
                { tool: "check_receivable_by_sales", status: "success", latency: "0.8s", time: "14:18" },
                { tool: "check_contract_status", status: "error", latency: "5.1s", time: "13:55" },
                { tool: "check_receivable_by_month", status: "success", latency: "1.1s", time: "13:42" },
              ].map((log, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${log.status === "success" ? "bg-success" : "bg-destructive"}`} />
                    <span className="text-xs font-mono">{log.tool}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="font-mono">{log.latency}</span>
                    <span>{log.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default Analytics;
