import AdminLayout from "@/components/layout/AdminLayout";
import StatCard from "@/components/dashboard/StatCard";
import {
  MessageSquare,
  Bot,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

const recentConversations = [
  { id: 1, user: "Nguyễn Văn A", message: "Làm sao để xuất báo cáo công nợ?", status: "active", intent: "how_to_use", time: "2 phút trước" },
  { id: 2, user: "Trần Thị B", message: "Kiểm tra công nợ tháng 2", status: "resolved", intent: "billing", time: "15 phút trước" },
  { id: 3, user: "Lê Văn C", message: "Lỗi không đăng nhập được", status: "handoff", intent: "bug_report", time: "32 phút trước" },
  { id: 4, user: "Phạm Thị D", message: "Tra cứu doanh số sales An Nguyên", status: "active", intent: "sales_lookup", time: "1 giờ trước" },
];

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
  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Tổng quan hoạt động AI Support Bot</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Tổng hội thoại"
            value="1,284"
            change="+12.5%"
            changeType="positive"
            icon={MessageSquare}
            subtitle="so với tuần trước"
          />
          <StatCard
            title="Deflection Rate"
            value="47.2%"
            change="+3.1%"
            changeType="positive"
            icon={Bot}
            subtitle="bot xử lý xong"
          />
          <StatCard
            title="Thời gian phản hồi"
            value="4.2s"
            change="-1.3s"
            changeType="positive"
            icon={Clock}
            subtitle="p95 response"
          />
          <StatCard
            title="Handoff Rate"
            value="18.3%"
            change="-2.7%"
            changeType="positive"
            icon={ArrowUpRight}
            subtitle="chuyển người thật"
          />
        </div>

        {/* Recent conversations */}
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div>
              <h2 className="text-base font-semibold">Hội thoại gần đây</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Cập nhật realtime</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex h-2 w-2 rounded-full bg-success animate-pulse-soft" />
              3 đang hoạt động
            </div>
          </div>
          <div className="divide-y">
            {recentConversations.map((conv) => (
              <div key={conv.id} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                  {conv.user.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{conv.user}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${intentColors[conv.intent] || ""}`}>
                      {conv.intent}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.message}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className={statusConfig[conv.status]?.class}>
                    {conv.status === "handoff" && <AlertTriangle className="h-3 w-3" />}
                    {conv.status === "resolved" && <CheckCircle2 className="h-3 w-3" />}
                    {statusConfig[conv.status]?.label}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{conv.time}</span>
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
