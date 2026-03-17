import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2 } from "lucide-react";

interface AgentDetailHeaderProps {
  tenant: any;
  isAgentBridge: boolean;
  agentId?: string;
  resolvedTenantId: string;
  onBack: () => void;
  onDelete: () => void;
}

export const AgentDetailHeader = ({
  tenant,
  isAgentBridge,
  agentId,
  onBack,
  onDelete,
}: AgentDetailHeaderProps) => {
  return (
    <div className="space-y-4">
      {isAgentBridge && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          Bạn đang ở <strong>agent-detail bridge</strong>: workspace vẫn dùng dữ liệu tenant-scoped hiện tại, nhưng UI đã được route theo mô hình
          <strong> Workspace → Agents → Agent Detail</strong>.
        </div>
      )}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
            {tenant.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isAgentBridge ? `${tenant.name} Assistant` : tenant.name}</h1>
            <p className="text-xs text-muted-foreground font-mono">
              {isAgentBridge ? `workspace:${tenant.slug} · agent:${agentId || "default"}` : `${tenant.slug} · ${tenant.domain || "—"}`}
            </p>
          </div>
        </div>
        <span className={tenant.status === "active" ? "badge-active" : "badge-pending"}>{tenant.status}</span>
        <Button variant="outline" size="sm" className="text-destructive gap-1.5" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />{isAgentBridge ? "Delete Workspace" : "Xóa"}
        </Button>
      </div>
    </div>
  );
};
