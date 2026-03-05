import { useState, useCallback } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, GitBranch, Trash2, Loader2, Save, Play } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenants } from "@/hooks/use-data";
import { toast } from "sonner";
import FlowCanvas from "@/components/flow/FlowCanvas";

const FlowBuilder = () => {
  const qc = useQueryClient();
  const { data: tenants } = useTenants();
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [canvasConfig, setCanvasConfig] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });

  const tenantId = selectedTenant || tenants?.[0]?.id || "";

  const { data: flows, isLoading } = useQuery({
    queryKey: ["flow_definitions", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flow_definitions")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: versions } = useQuery({
    queryKey: ["flow_versions", selectedFlow],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flow_versions")
        .select("*")
        .eq("flow_id", selectedFlow!)
        .order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedFlow,
  });

  const createFlow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("flow_definitions")
        .insert({ tenant_id: tenantId, name: newName, description: newDesc || null })
        .select()
        .single();
      if (error) throw error;
      const defaultConfig = {
        nodes: [{
          id: "start",
          type: "trigger",
          position: { x: 300, y: 50 },
          data: { label: "Conversation Start", type: "trigger", intent: "any" },
        }],
        edges: [],
      };
      await supabase.from("flow_versions").insert({
        flow_id: data.id,
        version: 1,
        config: defaultConfig,
        status: "draft",
      });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["flow_definitions"] });
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      setSelectedFlow(data.id);
      toast.success("Flow đã được tạo");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteFlow = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("flow_versions").delete().eq("flow_id", id);
      const { error } = await supabase.from("flow_definitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow_definitions"] });
      if (selectedFlow === deleteId) setSelectedFlow(null);
      setDeleteId(null);
      toast.success("Đã xoá flow");
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("flow_definitions").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flow_definitions"] }),
  });

  const saveVersion = useMutation({
    mutationFn: async () => {
      if (!selectedFlow) return;
      const currentVersion = versions?.[0]?.version || 0;
      const { error } = await supabase.from("flow_versions").insert({
        flow_id: selectedFlow,
        version: currentVersion + 1,
        config: canvasConfig,
        status: "draft",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow_versions"] });
      toast.success("Version mới đã lưu");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const publishVersion = useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await supabase
        .from("flow_versions")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", versionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow_versions"] });
      toast.success("Đã publish version");
    },
  });

  const handleConfigChange = useCallback((config: { nodes: any[]; edges: any[] }) => {
    setCanvasConfig(config);
  }, []);

  const loadVersion = useCallback((config: any) => {
    setCanvasConfig({
      nodes: config?.nodes || [],
      edges: config?.edges || [],
    });
  }, []);

  const selectedFlowData = flows?.find((f) => f.id === selectedFlow);

  // Auto-load latest version when selecting a flow
  const latestVersionConfig = versions?.[0]?.config as any;

  return (
    <AdminLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] -m-8 animate-slide-in">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b px-6 py-3 bg-card shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-bold tracking-tight">Flow Builder</h1>
              <p className="text-[11px] text-muted-foreground">Drag-drop visual editor</p>
            </div>
            {tenants && tenants.length > 1 && (
              <Select value={tenantId} onValueChange={setSelectedTenant}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue placeholder="Tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedFlowData && (
              <>
                <Badge variant={selectedFlowData.is_active ? "default" : "secondary"} className="text-[10px]">
                  {selectedFlowData.is_active ? "Active" : "Inactive"}
                </Badge>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => saveVersion.mutate()} disabled={saveVersion.isPending}>
                  {saveVersion.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Version
                </Button>
              </>
            )}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 h-8 glow-primary">
                  <Plus className="h-3.5 w-3.5" />
                  New Flow
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Tạo Flow mới</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Tên flow</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="VD: Welcome Flow" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Mô tả</Label>
                    <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Mô tả flow..." rows={3} />
                  </div>
                  <Button onClick={() => createFlow.mutate()} disabled={!newName.trim() || createFlow.isPending} className="w-full gap-2">
                    {createFlow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Tạo
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Flow list sidebar */}
          <div className="w-56 border-r flex flex-col bg-card shrink-0">
            <div className="p-3 border-b">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Flows</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              )}
              {!isLoading && (!flows || flows.length === 0) && (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  <GitBranch className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  Chưa có flow
                </div>
              )}
              {flows?.map((flow) => (
                <button
                  key={flow.id}
                  onClick={() => {
                    setSelectedFlow(flow.id);
                  }}
                  className={`w-full text-left px-3 py-2.5 transition-colors border-b ${
                    selectedFlow === flow.id ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium truncate">{flow.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={flow.is_active || false}
                        onCheckedChange={(checked) => toggleActive.mutate({ id: flow.id, active: checked })}
                        className="scale-[0.6]"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteId(flow.id); }}
                        className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Versions panel */}
            {selectedFlow && versions && versions.length > 0 && (
              <div className="border-t max-h-48 overflow-y-auto">
                <div className="p-3 border-b">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Versions</h3>
                </div>
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 border-b hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-semibold">v{v.version}</span>
                      <Badge variant={v.status === "published" ? "default" : "secondary"} className="text-[9px] h-4 px-1">
                        {v.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => loadVersion(v.config)}>
                        Load
                      </Button>
                      {v.status !== "published" && (
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => publishVersion.mutate(v.id)}>
                          <Play className="h-2.5 w-2.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Visual editor */}
          <div className="flex-1">
            {selectedFlowData ? (
              <FlowCanvas
                key={selectedFlow! + (latestVersionConfig ? JSON.stringify(latestVersionConfig).slice(0, 50) : "")}
                initialConfig={canvasConfig.nodes.length > 0 ? canvasConfig : (latestVersionConfig || { nodes: [], edges: [] })}
                onConfigChange={handleConfigChange}
              />
            ) : (
              <div className="flex-1 h-full flex items-center justify-center text-muted-foreground bg-muted/20">
                <div className="text-center">
                  <GitBranch className="h-16 w-16 mx-auto mb-4 opacity-15" />
                  <p className="text-sm font-medium">Chọn flow hoặc tạo mới</p>
                  <p className="text-xs text-muted-foreground mt-1">Drag-drop các node để xây dựng luồng hội thoại</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá flow?</AlertDialogTitle>
            <AlertDialogDescription>Tất cả versions sẽ bị xoá. Hành động không thể hoàn tác.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteFlow.mutate(deleteId)} className="bg-destructive text-destructive-foreground">
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default FlowBuilder;
