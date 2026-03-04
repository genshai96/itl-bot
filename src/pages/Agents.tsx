import AdminLayout from "@/components/layout/AdminLayout";
import { Users, Shield, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

const agents = [
  { id: 1, name: "Trần Minh Đức", role: "Support Agent", status: "online", activeChats: 3 },
  { id: 2, name: "Lê Thị Hương", role: "Support Lead", status: "online", activeChats: 1 },
  { id: 3, name: "Nguyễn Hoàng Nam", role: "Support Agent", status: "away", activeChats: 0 },
  { id: 4, name: "AI Bot", role: "AI Bot", status: "online", activeChats: 12, isBot: true },
];

const statusColors: Record<string, string> = {
  online: "bg-success",
  away: "bg-warning",
  offline: "bg-muted-foreground",
};

const Agents = () => {
  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
            <p className="text-sm text-muted-foreground mt-1">Quản lý support agents và phân quyền</p>
          </div>
          <Button size="sm" className="gap-2 glow-primary">
            <Users className="h-3.5 w-3.5" />
            Thêm agent
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="stat-card flex items-center gap-4">
              <div className="relative">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold ${
                  agent.isBot ? "bg-primary/10 text-primary" : "bg-muted"
                }`}>
                  {agent.isBot ? <Bot className="h-6 w-6" /> : agent.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${statusColors[agent.status]}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{agent.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Shield className="h-3 w-3" />
                    {agent.role}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{agent.activeChats} chat đang xử lý</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs">Chi tiết</Button>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default Agents;
