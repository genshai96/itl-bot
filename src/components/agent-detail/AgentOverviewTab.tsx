import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save } from "lucide-react";
import { format } from "date-fns";

interface AgentOverviewTabProps {
  tenant: any;
  conversationsCount: number;
  kbCount: number;
  toolCount: number;
  tenantName: string;
  tenantDomain: string;
  systemPrompt: string;
  saving: boolean;
  setTenantName: (value: string) => void;
  setTenantDomain: (value: string) => void;
  setSystemPrompt: (value: string) => void;
  onSaveTenantInfo: () => void;
  onSaveProviderConfig: () => void;
}

export const AgentOverviewTab = ({
  tenant,
  conversationsCount,
  kbCount,
  toolCount,
  tenantName,
  tenantDomain,
  systemPrompt,
  saving,
  setTenantName,
  setTenantDomain,
  setSystemPrompt,
  onSaveTenantInfo,
  onSaveProviderConfig,
}: AgentOverviewTabProps) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Conversations</p>
          <p className="text-3xl font-bold mt-1">{conversationsCount}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">KB Documents</p>
          <p className="text-3xl font-bold mt-1">{kbCount}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Tools</p>
          <p className="text-3xl font-bold mt-1">{toolCount}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h3 className="text-sm font-semibold">Workspace / Agent Identity</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Tên</Label>
            <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} className="h-10" maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Domain</Label>
            <Input value={tenantDomain} onChange={(e) => setTenantDomain(e.target.value)} className="h-10" maxLength={255} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Slug</Label>
            <Input value={tenant.slug} className="h-10 font-mono text-sm" readOnly />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Ngày tạo</Label>
            <Input value={format(new Date(tenant.created_at), "dd/MM/yyyy")} className="h-10" readOnly />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" className="gap-2 glow-primary" onClick={onSaveTenantInfo} disabled={saving}>
            <Save className="h-3.5 w-3.5" />Lưu
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h3 className="text-sm font-semibold">System Prompt</h3>
        <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={5} placeholder="Nhập system prompt cho AI bot..." />
        <div className="flex justify-end">
          <Button size="sm" className="gap-2 glow-primary" onClick={onSaveProviderConfig} disabled={saving}>
            <Save className="h-3.5 w-3.5" />Lưu
          </Button>
        </div>
      </div>
    </div>
  );
};
