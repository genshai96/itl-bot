import { useState, useMemo } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import StatCard from "@/components/dashboard/StatCard";
import { BarChart3, TrendingUp, MessageSquare, Clock, Loader2, Download, Calendar } from "lucide-react";
import { useConversationStats, useToolCallLogs, useHandoffEvents, useConversations } from "@/hooks/use-data";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, isAfter, startOfDay } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

const CHART_COLORS = [
  "hsl(173, 58%, 39%)", "hsl(38, 92%, 50%)", "hsl(210, 92%, 55%)",
  "hsl(0, 72%, 51%)", "hsl(152, 60%, 40%)", "hsl(280, 60%, 50%)",
];

const Analytics = () => {
  const [dateRange, setDateRange] = useState<string>("7");
  const { data: stats, isLoading: loadingStats } = useConversationStats();
  const { data: toolLogs, isLoading: loadingTools } = useToolCallLogs();
  const { data: handoffs } = useHandoffEvents();
  const { data: allConversations } = useConversations();

  const cutoff = startOfDay(subDays(new Date(), parseInt(dateRange)));
  const conversations = useMemo(
    () => (allConversations || []).filter((c) => isAfter(new Date(c.created_at), cutoff)),
    [allConversations, cutoff]
  );

  const totalConvs = stats?.total || 0;
  const allConvStats = stats?.conversations || [];

  // Intent distribution
  const intentMap: Record<string, number> = {};
  allConvStats.forEach((c: any) => {
    const intent = c.intent || "unknown";
    intentMap[intent] = (intentMap[intent] || 0) + 1;
  });
  const intents = Object.entries(intentMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Tool stats
  const filteredToolLogs = (toolLogs || []).filter((t) => isAfter(new Date(t.created_at), cutoff));
  const successTools = filteredToolLogs.filter((t) => t.status === "success").length;
  const totalTools = filteredToolLogs.length;
  const toolSuccessRate = totalTools > 0 ? ((successTools / totalTools) * 100).toFixed(1) : "—";

  // Avg confidence
  const confsWithVal = allConvStats.filter((c: any) => c.confidence != null);
  const avgConf = confsWithVal.length > 0
    ? (confsWithVal.reduce((s: number, c: any) => s + (c.confidence || 0), 0) / confsWithVal.length).toFixed(2)
    : "—";

  const pendingHandoffs = handoffs?.filter((h) => h.status === "pending").length || 0;

  // Conversations per day chart
  const dailyData = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = parseInt(dateRange) - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "MM/dd");
      days[d] = 0;
    }
    conversations.forEach((c) => {
      const d = format(new Date(c.created_at), "MM/dd");
      if (days[d] !== undefined) days[d]++;
    });
    return Object.entries(days).map(([date, count]) => ({ date, count }));
  }, [conversations, dateRange]);

  // Status distribution
  const statusData = useMemo(() => {
    const m: Record<string, number> = {};
    conversations.forEach((c) => {
      m[c.status] = (m[c.status] || 0) + 1;
    });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [conversations]);

  // Tool latency trend
  const latencyData = useMemo(() => {
    return filteredToolLogs
      .filter((t) => t.latency_ms)
      .slice(0, 20)
      .reverse()
      .map((t, i) => ({
        idx: i + 1,
        latency: t.latency_ms! / 1000,
        tool: t.tool_id,
      }));
  }, [filteredToolLogs]);

  const exportData = () => {
    const headers = ["date", "user", "status", "intent", "confidence"];
    const rows = conversations.map((c) => [
      c.created_at, c.end_user_name || c.end_user_email || "anon",
      c.status, c.intent || "", c.confidence || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">Phân tích hiệu suất bot và chất lượng support</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-36 h-9 text-xs gap-2">
                <Calendar className="h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 ngày qua</SelectItem>
                <SelectItem value="14">14 ngày qua</SelectItem>
                <SelectItem value="30">30 ngày qua</SelectItem>
                <SelectItem value="90">90 ngày qua</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={exportData}>
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Avg. Confidence" value={avgConf} icon={TrendingUp} subtitle="trung bình" />
          <StatCard title="Tool Success Rate" value={`${toolSuccessRate}%`} icon={BarChart3} subtitle={`${totalTools} calls`} />
          <StatCard title="Total Conversations" value={String(totalConvs)} icon={MessageSquare} subtitle="tất cả tenants" />
          <StatCard title="Pending Handoffs" value={String(pendingHandoffs)} icon={Clock} subtitle="chờ xử lý" />
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conversations per day */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold mb-4">Hội thoại theo ngày</h3>
            {dailyData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Chưa có dữ liệu</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(173, 58%, 39%)" radius={[4, 4, 0, 0]} name="Hội thoại" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Intent distribution pie */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold mb-4">Phân bố Intent</h3>
            {intents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Chưa có dữ liệu</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={intents}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name} (${value})`}
                    labelLine={false}
                  >
                    {intents.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status distribution */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold mb-4">Trạng thái hội thoại</h3>
            {statusData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Chưa có dữ liệu</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={statusData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={80} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" fill="hsl(210, 92%, 55%)" radius={[0, 4, 4, 0]} name="Số lượng" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Tool latency */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold mb-4">Tool Call Latency (s)</h3>
            {latencyData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Chưa có tool call logs</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={latencyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="idx" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: any) => [`${v}s`, "Latency"]}
                  />
                  <Line type="monotone" dataKey="latency" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tool call logs table */}
        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-sm font-semibold mb-4">Tool Call Logs (gần nhất)</h3>
          {loadingTools ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (!toolLogs || toolLogs.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-8">Chưa có tool call logs</p>
          ) : (
            <div className="space-y-2">
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
    </AdminLayout>
  );
};

export default Analytics;
