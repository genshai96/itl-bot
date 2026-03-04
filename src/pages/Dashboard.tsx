import AdminLayout from "@/components/layout/AdminLayout";
import StatCard from "@/components/dashboard/StatCard";
import { useConversations, useHandoffEvents, useConversationStats } from "@/hooks/use-data";
import { useRealtimeConversations } from "@/hooks/use-realtime";
import {
  MessageSquare, Bot, ArrowUpRight, Clock, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const intentColors: Record<string, string> = {
  how_to_use: "bg-info/10 text-info",
  billing: "bg-warning/10 text-warning",
  bug_report: "bg-destructive/10 text-destructive",
  sales_lookup: "bg-primary/10 text-primary",
};

const statusConfig: Record<string, { label: string; class: string }> = {
  active: { label: "Đang xử lý", class: "badge-active" },
  resolved: { label: "Đã xong", class: "badge-closed" },
  handoff: { label: "Chuyển agent", class: "badge-pending" },
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { data: conversations } = useConversations();
  const { data: handoffs } = useHandoffEvents();
  const { data: stats } = useConversationStats();
  useRealtimeConversations();

  const totalConvs = stats?.total || 0;
  const activeConvs = conversations?.filter((c) => c.status === "active").length || 0;
  const handoffCount = handoffs?.filter((h) => h.status === "pending").length || 0;
  const resolvedCount = conversations?.filter((c) => c.status === "resolved").length || 0;
  const deflectionRate = totalConvs > 0 ? ((resolvedCount / totalConvs) * 100).toFixed(1) : "0";
  const handoffRate = totalConvs > 0 ? ((handoffCount / totalConvs) * 100).toFixed(1) : "0";

  const recentConvs = (conversations || []).slice(0, 8);

  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Tổng quan hoạt động AI Support Bot</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Tổng hội thoại" value={String(totalConvs)} icon={MessageSquare} subtitle="tất cả tenants" />
          <StatCard title="Deflection Rate" value={`${deflectionRate}%`} icon={Bot} subtitle="bot xử lý xong" />
          <StatCard title="Đang hoạt động" value={String(activeConvs)} icon={Clock} subtitle="conversations active" />
          <StatCard title="Handoff pending" value={String(handoffCount)} icon={ArrowUpRight} subtitle="chờ agent nhận" />
        </div>

        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div>
              <h2 className="text-base font-semibold">Hội thoại gần đây</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Cập nhật realtime</p>
            </div>
            {activeConvs > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex h-2 w-2 rounded-full bg-success animate-pulse" />
                {activeConvs} đang hoạt động
              </div>
            )}
          </div>
          <div className="divide-y">
            {recentConvs.length === 0 && (
              <p className="text-center py-8 text-sm text-muted-foreground">Chưa có hội thoại nào</p>
            )}
            {recentConvs.map((conv) => (
              <div key={conv.id} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => navigate("/conversations")}>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                  {(conv.end_user_name || "?").charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{conv.end_user_name || conv.end_user_email || "Ẩn danh"}</p>
                    {conv.intent && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${intentColors[conv.intent] || "bg-muted text-muted-foreground"}`}>
                        {conv.intent}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className={statusConfig[conv.status]?.class || "badge-active"}>
                    {conv.status === "handoff" && <AlertTriangle className="h-3 w-3" />}
                    {conv.status === "resolved" && <CheckCircle2 className="h-3 w-3" />}
                    {statusConfig[conv.status]?.label || conv.status}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(conv.updated_at), "HH:mm")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default Dashboard;
