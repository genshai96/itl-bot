import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2, Rocket, Save, ServerCog, Workflow } from "lucide-react";
import { format } from "date-fns";

interface AgentCoreState {
  memoryV2Enabled: boolean;
  skillsRuntimeEnabled: boolean;
  mcpGatewayEnabled: boolean;
  memoryDecayDays: number;
  memoryMinConfidence: number;
}

interface RuntimeSnapshot {
  skills: any[];
  mcpState: any[];
  bootstrapRuns: any[];
}

interface AgentRuntimeTabProps {
  agentCore: AgentCoreState;
  setAgentCore: (value: AgentCoreState | ((prev: AgentCoreState) => AgentCoreState)) => void;
  saving: boolean;
  bootstrapBody: string;
  setBootstrapBody: (value: string) => void;
  bootstrapLoading: "validate" | "bootstrap" | null;
  bootstrapResult: any;
  runtimeSnapshot: RuntimeSnapshot;
  runtimeLoading: boolean;
  onSaveAgentCore: () => void;
  onRunBootstrapAction: (action: "validate" | "bootstrap") => void;
  onRefreshSnapshot: () => void;
}

export const AgentRuntimeTab = ({
  agentCore,
  setAgentCore,
  saving,
  bootstrapBody,
  setBootstrapBody,
  bootstrapLoading,
  bootstrapResult,
  runtimeSnapshot,
  runtimeLoading,
  onSaveAgentCore,
  onRunBootstrapAction,
  onRefreshSnapshot,
}: AgentRuntimeTabProps) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Workflow className="h-5 w-5 text-primary" /></div>
            <div>
              <h3 className="text-sm font-semibold">Agent Runtime Flags</h3>
              <p className="text-xs text-muted-foreground">Bật/tắt memory v2, skills runtime, MCP gateway</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Memory v2</p>
                <p className="text-[11px] text-muted-foreground">Automatic extraction/recall/decay</p>
              </div>
              <Switch checked={agentCore.memoryV2Enabled} onCheckedChange={(v) => setAgentCore((s) => ({ ...s, memoryV2Enabled: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Skills Runtime</p>
                <p className="text-[11px] text-muted-foreground">Tenant skill bindings + trigger routing</p>
              </div>
              <Switch checked={agentCore.skillsRuntimeEnabled} onCheckedChange={(v) => setAgentCore((s) => ({ ...s, skillsRuntimeEnabled: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium">MCP Gateway</p>
                <p className="text-[11px] text-muted-foreground">Circuit breaker + policy-governed tool route</p>
              </div>
              <Switch checked={agentCore.mcpGatewayEnabled} onCheckedChange={(v) => setAgentCore((s) => ({ ...s, mcpGatewayEnabled: v }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Memory Decay (days)</Label>
              <Input type="number" min={1} max={365} value={agentCore.memoryDecayDays} onChange={(e) => setAgentCore((s) => ({ ...s, memoryDecayDays: Number(e.target.value) || 30 }))} className="h-10 font-mono text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Memory Min Confidence</Label>
              <Input type="number" step="0.01" min={0} max={1} value={agentCore.memoryMinConfidence} onChange={(e) => setAgentCore((s) => ({ ...s, memoryMinConfidence: Number(e.target.value) || 0.55 }))} className="h-10 font-mono text-sm" />
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" className="gap-2 glow-primary" onClick={onSaveAgentCore} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Lưu Agent Core
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10"><ServerCog className="h-5 w-5 text-info" /></div>
            <div>
              <h3 className="text-sm font-semibold">Bootstrap Automation</h3>
              <p className="text-xs text-muted-foreground">Validate/Bootstrap tenant runtime (phase 6)</p>
            </div>
          </div>

          <Textarea value={bootstrapBody} onChange={(e) => setBootstrapBody(e.target.value)} rows={16} className="font-mono text-xs" />

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" className="gap-2" onClick={() => onRunBootstrapAction("validate")} disabled={bootstrapLoading !== null}>
              {bootstrapLoading === "validate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Validate
            </Button>
            <Button size="sm" className="gap-2 glow-primary" onClick={() => onRunBootstrapAction("bootstrap")} disabled={bootstrapLoading !== null}>
              {bootstrapLoading === "bootstrap" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              Bootstrap
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Skills Runtime</h4>
            <span className="text-xs text-muted-foreground">{runtimeSnapshot.skills.length} bindings</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {runtimeSnapshot.skills.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa có tenant skill bindings</p>
            ) : runtimeSnapshot.skills.map((b: any) => (
              <div key={b.id} className="rounded border px-3 py-2 text-xs">
                <p className="font-medium">{b.skills_registry?.name || b.skills_registry?.skill_id || "Unknown"}</p>
                <p className="text-muted-foreground">status: {b.status} · version: {b.pinned_version || b.skills_registry?.version || "-"}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">MCP Runtime State</h4>
            <Button variant="ghost" size="sm" className="text-xs" onClick={onRefreshSnapshot} disabled={runtimeLoading}>
              {runtimeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
            </Button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {runtimeSnapshot.mcpState.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa có state (chưa chạy tool qua MCP)</p>
            ) : runtimeSnapshot.mcpState.map((s: any) => (
              <div key={s.id} className="rounded border px-3 py-2 text-xs">
                <p className="font-medium">circuit: {s.circuit_state}</p>
                <p className="text-muted-foreground">failures: {s.failure_count} · last_health: {s.last_health_status || "-"}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Bootstrap Runs</h4>
            <span className="text-xs text-muted-foreground">{runtimeSnapshot.bootstrapRuns.length} recent</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {runtimeSnapshot.bootstrapRuns.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa có lịch sử bootstrap</p>
            ) : runtimeSnapshot.bootstrapRuns.map((r: any) => (
              <div key={r.id} className="rounded border px-3 py-2 text-xs">
                <p className="font-medium">{r.mode} · {r.status}</p>
                <p className="text-muted-foreground">{format(new Date(r.started_at), "dd/MM HH:mm")}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {bootstrapResult && (
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <h4 className="text-sm font-semibold">Bootstrap Result</h4>
          <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto max-h-80 overflow-y-auto">
            {JSON.stringify(bootstrapResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
