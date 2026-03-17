import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Box, ChevronDown, ChevronUp, Info, Loader2, Pin,
  Search, ToggleLeft, ToggleRight, Unlink, Wrench, Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type SkillRegistry  = Database["public"]["Tables"]["skills_registry"]["Row"];
type SkillBinding   = Database["public"]["Tables"]["tenant_skill_bindings"]["Row"];

type SkillWithBinding = SkillRegistry & {
  binding: SkillBinding | null;
};

interface AgentSkillsTabProps {
  tenantId: string;
}

const statusColor: Record<string, string> = {
  active:   "text-success",
  disabled: "text-muted-foreground",
  error:    "text-destructive",
  pending:  "text-amber-500",
};

export const AgentSkillsTab = ({ tenantId }: AgentSkillsTabProps) => {
  const qc = useQueryClient();

  const [search, setSearch]         = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillWithBinding | null>(null);
  const [configJson, setConfigJson]   = useState("{}");
  const [configJsonErr, setConfigJsonErr] = useState(false);
  const [pinnedVersion, setPinnedVersion] = useState("");
  const [unbindTarget, setUnbindTarget]   = useState<SkillWithBinding | null>(null);

  // ── queries ──────────────────────────────────────────────────────────────
  const { data: registry = [], isLoading: loadingRegistry } = useQuery<SkillRegistry[]>({
    queryKey: ["skills_registry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skills_registry")
        .select("*")
        .eq("status", "active")
        .order("category")
        .order("name");
      if (error) throw error;
      return data as SkillRegistry[];
    },
  });

  const { data: bindings = [], isLoading: loadingBindings } = useQuery<SkillBinding[]>({
    queryKey: ["tenant_skill_bindings", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_skill_bindings")
        .select("*")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return data as SkillBinding[];
    },
    enabled: !!tenantId,
  });

  // Merge registry with binding state
  const skills: SkillWithBinding[] = registry.map((skill) => ({
    ...skill,
    binding: bindings.find((b) => b.skill_registry_id === skill.id) ?? null,
  }));

  const filtered = search
    ? skills.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.skill_id.toLowerCase().includes(search.toLowerCase()) ||
          (s.category ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : skills;

  const enabledCount = bindings.filter((b) => b.status === "active").length;

  // ── mutations ─────────────────────────────────────────────────────────────
  const toggleMut = useMutation({
    mutationFn: async ({ skill, enabled }: { skill: SkillWithBinding; enabled: boolean }) => {
      const newStatus = enabled ? "active" : "disabled";
      if (skill.binding) {
        const { error } = await supabase
          .from("tenant_skill_bindings")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", skill.binding.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tenant_skill_bindings")
          .insert({
            tenant_id: tenantId,
            skill_registry_id: skill.id,
            status: newStatus,
            config: {},
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["tenant_skill_bindings", tenantId] });
      toast.success(
        vars.enabled
          ? `Đã bật ${vars.skill.name}`
          : `Đã tắt ${vars.skill.name}`,
      );
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveCfgMut = useMutation({
    mutationFn: async ({
      skill,
      config,
      pinned,
    }: {
      skill: SkillWithBinding;
      config: Record<string, unknown>;
      pinned: string;
    }) => {
      const payload = {
        config,
        pinned_version: pinned || null,
        updated_at: new Date().toISOString(),
      };
      if (skill.binding) {
        const { error } = await supabase
          .from("tenant_skill_bindings")
          .update(payload)
          .eq("id", skill.binding.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tenant_skill_bindings")
          .insert({
            tenant_id: tenantId,
            skill_registry_id: skill.id,
            status: "active",
            ...payload,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_skill_bindings", tenantId] });
      toast.success("Đã lưu config skill");
      setConfigOpen(false);
      setEditingSkill(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unbindMut = useMutation({
    mutationFn: async (bindingId: string) => {
      const { error } = await supabase
        .from("tenant_skill_bindings")
        .delete()
        .eq("id", bindingId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_skill_bindings", tenantId] });
      toast.success("Đã xóa binding");
      setUnbindTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── helpers ───────────────────────────────────────────────────────────────
  const openConfig = (skill: SkillWithBinding) => {
    setEditingSkill(skill);
    const cfgStr = skill.binding?.config
      ? JSON.stringify(skill.binding.config, null, 2)
      : "{}";
    setConfigJson(cfgStr);
    setConfigJsonErr(false);
    setPinnedVersion(skill.binding?.pinned_version ?? "");
    setConfigOpen(true);
  };

  const handleSaveCfg = () => {
    if (!editingSkill) return;
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(configJson);
    } catch {
      setConfigJsonErr(true);
      return;
    }
    saveCfgMut.mutate({ skill: editingSkill, config: parsed, pinned: pinnedVersion });
  };

  const manifestFields = (skill: SkillWithBinding): string[] => {
    try {
      const m = skill.manifest as any;
      const props = m?.parameters?.properties ?? m?.input_schema?.properties ?? {};
      return Object.keys(props);
    } catch {
      return [];
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  const loading = loadingRegistry || loadingBindings;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              Agent Skills
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gắn skills từ registry vào tenant này. Mỗi skill active sẽ được
              runtime load khi Skills Runtime flag bật.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span>{enabledCount} active</span>
            <span className="text-border">·</span>
            <span>{registry.length} available</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm skill..."
            className="pl-9 h-9 text-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Đang tải skills registry...
          </div>
        ) : registry.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card p-12 text-center text-muted-foreground space-y-2">
            <Box className="h-10 w-10 mx-auto opacity-20" />
            <p className="text-sm">Chưa có skill nào trong registry.</p>
            <p className="text-xs">Thêm skills qua Bootstrap → Runtime tab để populate skills_registry.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Không tìm thấy skill khớp với "{search}".
          </p>
        ) : (
          <div className="space-y-3">
            {filtered.map((skill) => {
              const isActive  = skill.binding?.status === "active";
              const hasBinding = !!skill.binding;
              const isExpanded = expandedId === skill.id;
              const fields = manifestFields(skill);

              return (
                <div
                  key={skill.id}
                  className={`rounded-lg border bg-card transition-all ${
                    !hasBinding ? "opacity-70" : ""
                  } ${isActive ? "border-primary/30" : ""}`}
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    {/* Icon */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                      <Wrench className="h-4 w-4 text-primary" />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{skill.name}</span>
                        {skill.category && (
                          <Badge variant="outline" className="text-[10px]">
                            {skill.category}
                          </Badge>
                        )}
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${statusColor[skill.binding?.status ?? ""] ?? ""}`}
                        >
                          {hasBinding ? (skill.binding!.status) : "not bound"}
                        </Badge>
                        {skill.binding?.pinned_version && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Pin className="h-2.5 w-2.5" />
                            v{skill.binding.pinned_version}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {skill.description ?? skill.skill_id}
                      </p>
                      {fields.length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          inputs: {fields.slice(0, 4).join(", ")}
                          {fields.length > 4 && ` +${fields.length - 4}`}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Toggle */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => toggleMut.mutate({ skill, enabled: !isActive })}
                            disabled={toggleMut.isPending}
                            className="text-muted-foreground hover:text-primary transition-colors"
                          >
                            {isActive
                              ? <ToggleRight className="h-5 w-5 text-primary" />
                              : <ToggleLeft className="h-5 w-5" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isActive ? "Tắt skill" : "Bật skill"}
                        </TooltipContent>
                      </Tooltip>

                      {/* Configure */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openConfig(skill)}
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Config & pin version</TooltipContent>
                      </Tooltip>

                      {/* Unbind */}
                      {hasBinding && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive/60 hover:text-destructive"
                              onClick={() => setUnbindTarget(skill)}
                            >
                              <Unlink className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Xóa binding</TooltipContent>
                        </Tooltip>
                      )}

                      {/* Expand manifest */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setExpandedId(isExpanded ? null : skill.id)}
                      >
                        {isExpanded
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded manifest preview */}
                  {isExpanded && (
                    <div className="border-t px-4 py-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Box className="h-3.5 w-3.5" />Manifest · v{skill.version}
                      </div>
                      <pre className="rounded-lg bg-muted p-3 text-[11px] font-mono overflow-x-auto max-h-48 overflow-y-auto">
                        {JSON.stringify(skill.manifest, null, 2)}
                      </pre>
                      {skill.binding?.config &&
                        Object.keys(skill.binding.config as object).length > 0 && (
                          <>
                            <div className="text-xs font-medium text-muted-foreground">
                              Tenant config overrides
                            </div>
                            <pre className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-[11px] font-mono overflow-x-auto max-h-32 overflow-y-auto">
                              {JSON.stringify(skill.binding.config, null, 2)}
                            </pre>
                          </>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Config dialog */}
        <Dialog open={configOpen} onOpenChange={(o) => { setConfigOpen(o); if (!o) setEditingSkill(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                Config — {editingSkill?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">
                  Config JSON
                  <span className="text-muted-foreground ml-1">(override manifest defaults)</span>
                </Label>
                <Textarea
                  value={configJson}
                  onChange={(e) => {
                    setConfigJson(e.target.value);
                    setConfigJsonErr(false);
                    try { JSON.parse(e.target.value); setConfigJsonErr(false); }
                    catch { setConfigJsonErr(true); }
                  }}
                  rows={8}
                  className={`font-mono text-xs ${configJsonErr ? "border-destructive" : ""}`}
                  placeholder="{}"
                />
                {configJsonErr && (
                  <p className="text-[11px] text-destructive">JSON không hợp lệ</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <Pin className="h-3.5 w-3.5" />
                  Pinned version
                  <span className="text-muted-foreground">(để trống = dùng latest)</span>
                </Label>
                <Input
                  value={pinnedVersion}
                  onChange={(e) => setPinnedVersion(e.target.value)}
                  placeholder={editingSkill?.version ?? "1.0.0"}
                  className="font-mono text-sm h-9 max-w-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfigOpen(false)}>
                  Hủy
                </Button>
                <Button
                  size="sm"
                  className="gap-2 glow-primary"
                  onClick={handleSaveCfg}
                  disabled={configJsonErr || saveCfgMut.isPending}
                >
                  {saveCfgMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Lưu config
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Unbind confirm */}
        <AlertDialog open={!!unbindTarget} onOpenChange={(o) => { if (!o) setUnbindTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Xóa binding "{unbindTarget?.name}"?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Binding sẽ bị xóa khỏi tenant này. Skill sẽ không được load cho đến khi bật lại.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (unbindTarget?.binding?.id) {
                    unbindMut.mutate(unbindTarget.binding.id);
                  }
                }}
              >
                {unbindMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Xóa binding
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
};
