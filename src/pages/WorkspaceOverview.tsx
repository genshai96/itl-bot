import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant, useTenantConfig, useConversations, useKbDocuments, useToolDefinitions } from "@/hooks/use-data";
import { ArrowRight, Bot, Brain, FileText, GitBranch, Settings, Users, Wrench } from "lucide-react";

const WorkspaceOverview = () => {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { data: workspace, isLoading: loadingWorkspace } = useTenant(workspaceId || "");
  const { data: config, isLoading: loadingConfig } = useTenantConfig(workspaceId || "");
  const { data: conversations } = useConversations(workspaceId);
  const { data: kbDocs } = useKbDocuments(workspaceId || "");
  const { data: tools } = useToolDefinitions(workspaceId || "");

  const stats = useMemo(() => ({
    agentCount: workspace ? 1 : 0,
    activeConversations: conversations?.filter((c) => c.status === "active").length || 0,
    kbCount: kbDocs?.length || 0,
    toolCount: tools?.length || 0,
  }), [workspace, conversations, kbDocs, tools]);

  if (loadingWorkspace || loadingConfig) {
    return (
      <AdminLayout>
        <div className="space-y-6 animate-slide-in">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!workspace) {
    return (
      <AdminLayout>
        <div className="py-20 text-center text-muted-foreground">Workspace không tồn tại</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{workspace.name}</h1>
              <Badge variant={workspace.status === "active" ? "default" : "secondary"}>{workspace.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Workspace overview — agent-centric bridge trên dữ liệu tenant hiện tại
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate(`/workspaces/${workspace.id}/settings`)} className="gap-2">
              <Settings className="h-3.5 w-3.5" />Workspace Settings
            </Button>
            <Button size="sm" className="gap-2 glow-primary" onClick={() => navigate(`/workspaces/${workspace.id}/agents`)}>
              <Bot className="h-3.5 w-3.5" />Open Agents
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">Agents</p>
            <p className="text-3xl font-bold mt-1">{stats.agentCount}</p>
            <p className="text-xs text-muted-foreground mt-1">default bridge agent</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">Active Conversations</p>
            <p className="text-3xl font-bold mt-1">{stats.activeConversations}</p>
            <p className="text-xs text-muted-foreground mt-1">runtime activity</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">Knowledge Docs</p>
            <p className="text-3xl font-bold mt-1">{stats.kbCount}</p>
            <p className="text-xs text-muted-foreground mt-1">shared workspace assets</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">Tools</p>
            <p className="text-3xl font-bold mt-1">{stats.toolCount}</p>
            <p className="text-xs text-muted-foreground mt-1">integration bindings</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-base font-semibold">Workspace Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground mb-1">Default agent</p>
                <p className="font-semibold">{workspace.name} Assistant</p>
                <p className="text-xs text-muted-foreground mt-1">Bridge agent được map từ tenant config hiện tại</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground mb-1">Provider model</p>
                <p className="font-semibold">{config?.provider_model || "Chưa cấu hình"}</p>
                <p className="text-xs text-muted-foreground mt-1">endpoint: {config?.provider_endpoint || "—"}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground mb-1">Memory mode</p>
                <p className="font-semibold">{(config as any)?.memory_v2_enabled ? "Memory v2 enabled" : "Legacy / basic"}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground mb-1">Guardrails</p>
                <p className="font-semibold">Threshold {config?.confidence_threshold ?? 0.6}</p>
                <p className="text-xs text-muted-foreground mt-1">PII masking: {config?.pii_masking ? "on" : "off"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-base font-semibold">Quick Actions</h2>
            <div className="space-y-3">
              <button onClick={() => navigate(`/workspaces/${workspace.id}/agents`)} className="w-full rounded-lg border px-4 py-3 text-left hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Bot className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Agents</p>
                      <p className="text-xs text-muted-foreground">Open default agent and future agent list</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
              <button onClick={() => navigate(`/workspaces/${workspace.id}/agents/default?tab=memory`)} className="w-full rounded-lg border px-4 py-3 text-left hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Brain className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Memory</p>
                      <p className="text-xs text-muted-foreground">Go to agent memory bridge</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
              <button onClick={() => navigate(`/flows`)} className="w-full rounded-lg border px-4 py-3 text-left hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <GitBranch className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Flow Builder</p>
                      <p className="text-xs text-muted-foreground">Legacy builder until agent binding phase lands</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
              <button onClick={() => navigate(`/operators`)} className="w-full rounded-lg border px-4 py-3 text-left hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Members / Operators</p>
                      <p className="text-xs text-muted-foreground">Human admin and support access</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-base font-semibold mb-4">Shared Library Snapshot</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-2"><FileText className="h-4 w-4 text-primary" /><span className="font-medium">Knowledge</span></div>
              <p className="text-muted-foreground text-xs">Workspace-shared KB documents remain tenant-scoped today.</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-2"><Wrench className="h-4 w-4 text-primary" /><span className="font-medium">Integrations</span></div>
              <p className="text-muted-foreground text-xs">Tool definitions and runtime bindings are still shared at workspace level.</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-2"><Brain className="h-4 w-4 text-primary" /><span className="font-medium">Skills / Memory</span></div>
              <p className="text-muted-foreground text-xs">Currently bridged from legacy tenant memory until per-agent schema lands.</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default WorkspaceOverview;
