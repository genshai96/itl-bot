import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTenants, useTenantConfig } from "@/hooks/use-data";
import { Bot, Building2, ArrowRight, Plus } from "lucide-react";

const AgentBridgeCard = ({ workspace }: { workspace: any }) => {
  const navigate = useNavigate();
  const { data: config } = useTenantConfig(workspace.id);

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold">{workspace.name} Assistant</h3>
            <Badge variant="outline">default</Badge>
            <Badge variant={workspace.status === "active" ? "default" : "secondary"}>{workspace.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {workspace.name}
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate(`/workspaces/${workspace.id}/agents/default`)}>
          Open <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Model</p>
          <p className="font-medium mt-1 break-words">{config?.provider_model || "Chưa cấu hình"}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Memory</p>
          <p className="font-medium mt-1">{(config as any)?.memory_v2_enabled ? "memory-v2" : "legacy"}</p>
        </div>
      </div>
    </div>
  );
};

const Agents = () => {
  const navigate = useNavigate();
  const { data: workspaces, isLoading } = useTenants();

  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI agents view — hiện mỗi workspace được bridge thành một default agent
            </p>
          </div>
          <Button size="sm" className="gap-2 glow-primary" onClick={() => navigate(`/workspaces`)}>
            <Plus className="h-3.5 w-3.5" />Open Workspaces
          </Button>
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Đây là bước chuyển tiếp từ tenant-centric sang agent-centric IA. Khi schema <strong>agents</strong> riêng được thêm,
          trang này sẽ hiển thị nhiều agent thực thay vì chỉ default-agent bridge.
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Đang tải agents...</div>
        ) : !workspaces || workspaces.length === 0 ? (
          <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
            Chưa có workspace nào để tạo bridge agent.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {workspaces.map((workspace) => (
              <AgentBridgeCard key={workspace.id} workspace={workspace} />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default Agents;
