import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant, useTenantConfig, useConversations, useKbDocuments, useToolDefinitions } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowRight, Bot, Brain, GitBranch, Loader2, MessageSquare, Plus, Sparkles, Workflow, Wrench } from "lucide-react";

interface AgentRow {
  id: string;
  name: string;
  slug: string;
  kind: string;
  status: string;
  is_default: boolean;
  public_name: string | null;
  created_at: string;
}

const WorkspaceAgents = () => {
  const { workspaceId } = useParams();
  const navigate = useNavigate();

  const { data: workspace, isLoading: loadingWorkspace } = useTenant(workspaceId || "");
  const { data: config, isLoading: loadingConfig } = useTenantConfig(workspaceId || "");
  const { data: conversations } = useConversations(workspaceId);
  const { data: kbDocs } = useKbDocuments(workspaceId || "");
  const { data: tools } = useToolDefinitions(workspaceId || "");

  const [agents, setAgents]   = useState<AgentRow[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Load real agents for this workspace
  useEffect(() => {
    if (!workspaceId) return;
    setAgentsLoading(true);
    supabase
      .from("agents" as any)
      .select("id, name, slug, kind, status, is_default, public_name, created_at")
      .eq("tenant_id", workspaceId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setAgents(data as AgentRow[]);
        setAgentsLoading(false);
      });
  }, [workspaceId]);

  // Auto-create default agent if none exist
  const ensureDefaultAgent = async () => {
    if (!workspaceId || !workspace) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("agents" as any)
        .insert({
          tenant_id: workspaceId,
          name: `${workspace.name} Assistant`,
          slug: "default-agent",
          kind: "assistant",
          status: "active",
          is_default: true,
          public_name: `${workspace.name} Assistant`,
        })
        .select("id, name, slug, kind, status, is_default, public_name, created_at")
        .single();
      if (error) throw error;
      setAgents([data as AgentRow]);
      navigate(`/workspaces/${workspaceId}/agents/${(data as AgentRow).id}`);
    } catch (err: any) {
      // If unique slug conflict, just reload
      const { data } = await supabase
        .from("agents" as any)
        .select("id, name, slug, kind, status, is_default, public_name, created_at")
        .eq("tenant_id", workspaceId)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) navigate(`/workspaces/${workspaceId}/agents/${(data as AgentRow).id}`);
    } finally {
      setCreating(false);
    }
  };

  if (loadingWorkspace || loadingConfig) {
    return (
      <AdminLayout>
        <div className="space-y-6 animate-slide-in">
          <Skeleton className="h-10 w-64" />
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

  const statusVariant = (s: string) =>
    s === "active" ? ("default" as const) : ("secondary" as const);

  return (
    <AdminLayout>
      <div className="space-y-8 animate-slide-in">
        {/* ── header ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-9 w-9"
              onClick={() => navigate(`/workspaces/${workspace.id}`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Workspace {workspace.name}
                {!agentsLoading && (
                  <span className="ml-2 text-xs">· {agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
                )}
              </p>
            </div>
          </div>
          {agents.length === 0 && !agentsLoading && (
            <Button size="sm" className="gap-2 glow-primary" onClick={ensureDefaultAgent} disabled={creating}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Tạo Default Agent
            </Button>
          )}
        </div>

        {/* ── agents list ── */}
        {agentsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-12 text-center text-muted-foreground space-y-3">
            <Bot className="h-12 w-12 mx-auto opacity-20" />
            <p className="text-sm">Workspace này chưa có agent nào.</p>
            <Button size="sm" className="gap-2 glow-primary" onClick={ensureDefaultAgent} disabled={creating}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Tạo Default Agent
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {agents.map((agent) => (
              <div key={agent.id} className="rounded-xl border bg-card p-6 space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Bot className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-semibold">{agent.name}</h2>
                        <Badge variant={statusVariant(agent.status)}>{agent.status}</Badge>
                        {agent.is_default && <Badge variant="outline">default</Badge>}
                        <Badge variant="outline" className="text-[10px]">{agent.kind}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">{agent.id.slice(0, 8)}…</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2 shrink-0"
                    onClick={() => navigate(`/workspaces/${workspace.id}/agents/${agent.id}`)}>
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Stats only for the default agent (has data from tenant-level queries) */}
                {agent.is_default && (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Model</p>
                      <p className="font-semibold mt-0.5 break-all text-xs">
                        {config?.provider_model || "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Conversations</p>
                      <p className="font-semibold mt-0.5">{conversations?.length ?? 0}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">KB / Tools</p>
                      <p className="font-semibold mt-0.5">
                        {kbDocs?.length ?? 0} / {tools?.length ?? 0}
                      </p>
                    </div>
                  </div>
                )}

                {/* Quick nav shortcuts */}
                {agent.is_default && (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { tab: "overview",    icon: Sparkles,     label: "Overview",        href: null },
                      { tab: "provider",    icon: Wrench,       label: "Core / Provider", href: null },
                      { tab: "memory",      icon: Brain,        label: "Memory",          href: null },
                      { tab: "skills",      icon: Wrench,       label: "Skills",          href: null },
                      { tab: "flows",       icon: Workflow,     label: "Flows",           href: `/flows?tenant=${workspaceId}` },
                      { tab: "test",        icon: MessageSquare, label: "Test Console",   href: null },
                      { tab: "agent-core",  icon: GitBranch,    label: "Runtime",         href: null },
                    ].map(({ tab, icon: Icon, label, href }) => (
                      <button
                        key={tab}
                        onClick={() => href ? navigate(href) : navigate(`/workspaces/${workspace.id}/agents/${agent.id}?tab=${tab}`)}
                        className="rounded-lg border px-3 py-2.5 text-left text-xs hover:bg-muted/50 transition-colors flex items-center gap-2"
                      >
                        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default WorkspaceAgents;
