import { useState } from "react";
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
import { Plus, GitBranch, Trash2, Loader2, Save, Play, ChevronRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenants } from "@/hooks/use-data";
import { toast } from "sonner";

const FlowBuilder = () => {
  const qc = useQueryClient();
  const { data: tenants } = useTenants();
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<string>("{}");

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
      // Create initial version
      await supabase.from("flow_versions").insert({
        flow_id: data.id,
        version: 1,
        config: { nodes: [], edges: [], triggers: [] },
        status: "draft",
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow_definitions"] });
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
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
        config: JSON.parse(editingConfig),
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

  const selectedFlowData = flows?.find((f) => f.id === selectedFlow);

  return (
    <AdminLayout>
      <div className="space-y-6 animate-slide-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Flow Builder</h1>
            <p className="text-sm text-muted-foreground mt-1">Xây dựng luồng xử lý hội thoại</p>
          </div>
          <div className="flex items-center gap-3">
            {tenants && tenants.length > 1 && (
              <Select value={tenantId} onValueChange={setSelectedTenant}>
                <SelectTrigger className="w-48 h-9 text-xs">
                  <SelectValue placeholder="Chọn tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2 glow-primary">
                  <Plus className="h-4 w-4" />
                  Tạo Flow
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

        <div className="flex gap-6 min-h-[calc(100vh-12rem)]">
          {/* Flow list */}
          <div className="w-72 rounded-lg border bg-card flex flex-col">
            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold">Danh sách Flows</h3>
            </div>
            <div className="flex-1 overflow-y-auto divide-y">
              {isLoading && (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              )}
              {!isLoading && (!flows || flows.length === 0) && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Chưa có flow nào
                </div>
              )}
              {flows?.map((flow) => (
                <button
                  key={flow.id}
                  onClick={() => {
                    setSelectedFlow(flow.id);
                    setEditingConfig("{}");
                  }}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    selectedFlow === flow.id ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">{flow.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={flow.is_active || false}
                        onCheckedChange={(checked) => toggleActive.mutate({ id: flow.id, active: checked })}
                        className="scale-75"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteId(flow.id); }}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {flow.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{flow.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Flow editor */}
          <div className="flex-1 rounded-lg border bg-card flex flex-col">
            {selectedFlowData ? (
              <>
                <div className="flex items-center justify-between border-b px-6 py-4">
                  <div>
                    <h3 className="text-base font-semibold">{selectedFlowData.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedFlowData.description || "Không có mô tả"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={selectedFlowData.is_active ? "default" : "secondary"}>
                      {selectedFlowData.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={() => saveVersion.mutate()} disabled={saveVersion.isPending}>
                      <Save className="h-3.5 w-3.5" />
                      Save Version
                    </Button>
                  </div>
                </div>

                <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                  {/* Flow config editor */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Flow Config (JSON)</Label>
                    <Textarea
                      value={editingConfig}
                      onChange={(e) => setEditingConfig(e.target.value)}
                      className="font-mono text-xs min-h-[200px]"
                      placeholder='{"nodes": [], "edges": [], "triggers": []}'
                    />
                  </div>

                  {/* Versions */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Versions</h4>
                    {versions?.map((v) => (
                      <div key={v.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono font-semibold">v{v.version}</span>
                          <Badge variant={v.status === "published" ? "default" : "secondary"} className="text-[10px]">
                            {v.status}
                          </Badge>
                          {v.published_at && (
                            <span className="text-[10px] text-muted-foreground">
                              Published: {new Date(v.published_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs gap-1"
                            onClick={() => setEditingConfig(JSON.stringify(v.config, null, 2))}
                          >
                            Load
                          </Button>
                          {v.status !== "published" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs gap-1"
                              onClick={() => publishVersion.mutate(v.id)}
                            >
                              <Play className="h-3 w-3" />
                              Publish
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Chọn flow để chỉnh sửa</p>
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
