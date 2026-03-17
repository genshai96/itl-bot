import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Brain, Plus, Search, Shield, Sparkles, MessageSquareWarning,
  Lightbulb, Wrench, MoreHorizontal, Pencil, Trash2, Loader2, Save, Zap, Globe,
} from "lucide-react";
import { toast } from "sonner";

type MemoryCategory = "rule" | "correction" | "fact" | "personality" | "skill" | "constraint";

const categoryConfig: Record<MemoryCategory, { label: string; icon: typeof Brain; color: string; desc: string }> = {
  rule: { label: "Rules", icon: Shield, color: "text-blue-500 bg-blue-500/10", desc: "Quy tắc bot phải tuân theo" },
  correction: { label: "Corrections", icon: MessageSquareWarning, color: "text-orange-500 bg-orange-500/10", desc: "Sửa lỗi câu trả lời" },
  fact: { label: "Facts", icon: Lightbulb, color: "text-yellow-500 bg-yellow-500/10", desc: "Thông tin cần nhớ" },
  personality: { label: "Personality", icon: Sparkles, color: "text-purple-500 bg-purple-500/10", desc: "Phong cách trả lời" },
  skill: { label: "Skills", icon: Wrench, color: "text-green-500 bg-green-500/10", desc: "Khả năng / MCP tools" },
  constraint: { label: "Constraints", icon: Shield, color: "text-red-500 bg-red-500/10", desc: "Giới hạn & ràng buộc" },
};

interface BotMemoryCategoryManagerProps {
  tenantId: string;
  title: string;
  description: string;
  categories: MemoryCategory[];
  defaultCategory: MemoryCategory;
  compact?: boolean;
}

export const BotMemoryCategoryManager = ({
  tenantId,
  title,
  description,
  categories,
  defaultCategory,
  compact = false,
}: BotMemoryCategoryManagerProps) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const [formCategory, setFormCategory] = useState<MemoryCategory>(defaultCategory);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formPriority, setFormPriority] = useState(0);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formMetadata, setFormMetadata] = useState<Record<string, any>>({});

  const { data: memories, isLoading } = useQuery({
    queryKey: ["bot_memory", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_memory")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (item: any) => {
      const { error } = await supabase.from("bot_memory").insert(item);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot_memory"] });
      toast.success("Đã thêm entry");
      resetForm();
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase.from("bot_memory").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot_memory"] });
      toast.success("Đã cập nhật");
      resetForm();
      setDialogOpen(false);
      setEditingItem(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bot_memory").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot_memory"] });
      toast.success("Đã xóa");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("bot_memory").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot_memory"] }),
  });

  const resetForm = () => {
    setFormCategory(defaultCategory);
    setFormTitle("");
    setFormContent("");
    setFormPriority(0);
    setFormEnabled(true);
    setFormMetadata({});
    setEditingItem(null);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setFormCategory(item.category);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormPriority(item.priority);
    setFormEnabled(item.enabled);
    setFormMetadata(item.metadata || {});
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formTitle.trim() || !formContent.trim() || !tenantId) return;
    const payload = {
      tenant_id: tenantId,
      category: formCategory,
      title: formTitle.trim(),
      content: formContent.trim(),
      priority: formPriority,
      enabled: formEnabled,
      metadata: formMetadata,
      created_by: user?.id,
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, updates: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filtered = useMemo(() => {
    let list = (memories || []).filter((m) => categories.includes(m.category as MemoryCategory));
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((m) => m.title.toLowerCase().includes(s) || m.content.toLowerCase().includes(s));
    }
    return list;
  }, [memories, categories, searchTerm]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const cat of categories) {
      c[cat] = (memories || []).filter((m) => m.category === cat).length;
    }
    return c;
  }, [memories, categories]);

  const categoryOptions = categories.map((cat) => [cat, categoryConfig[cat]] as const);
  const singleCategory = categories.length === 1;

  const formDialog = (
    <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size={compact ? "sm" : "default"} className="gap-2 glow-primary">
          <Plus className="h-4 w-4" />
          Thêm mới
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingItem ? "Chỉnh sửa" : "Thêm"} {singleCategory ? categoryConfig[defaultCategory].label : "Entry"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!singleCategory && (
            <div className="space-y-2">
              <Label className="text-xs">Loại</Label>
              <Select value={formCategory} onValueChange={(v) => setFormCategory(v as MemoryCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <cfg.icon className={`h-3.5 w-3.5 ${cfg.color.split(" ")[0]}`} />
                        {cfg.label} — {cfg.desc}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Tiêu đề</Label>
            <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder={formCategory === "skill" ? "VD: Search Order API" : "VD: Luôn chào khách bằng tên"} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Nội dung</Label>
            <Textarea value={formContent} onChange={(e) => setFormContent(e.target.value)} placeholder="Mô tả chi tiết rule/correction/skill..." rows={4} />
          </div>

          {formCategory === "skill" && (
            <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-green-500" />
                Cấu hình Skill / MCP Tool
              </p>
              <div className="space-y-2">
                <Label className="text-xs">Endpoint URL</Label>
                <Input value={formMetadata.endpoint || ""} onChange={(e) => setFormMetadata({ ...formMetadata, endpoint: e.target.value })} placeholder="https://api.example.com/search" className="font-mono text-xs" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">HTTP Method</Label>
                <Select value={formMetadata.method || "POST"} onValueChange={(v) => setFormMetadata({ ...formMetadata, method: v })}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Input Schema (JSON)</Label>
                <Textarea
                  value={formMetadata.input_schema ? JSON.stringify(formMetadata.input_schema, null, 2) : ""}
                  onChange={(e) => { try { setFormMetadata({ ...formMetadata, input_schema: JSON.parse(e.target.value) }); } catch { /* ignore */ } }}
                  placeholder='{"type":"object","properties":{"query":{"type":"string"}}}'
                  className="font-mono text-xs"
                  rows={3}
                />
              </div>
            </div>
          )}

          {formCategory === "correction" && (
            <div className="rounded-lg bg-orange-500/5 border border-orange-500/20 p-3">
              <p className="text-[11px] text-muted-foreground">
                💡 Correction: Khi bot trả lời sai một câu hỏi, thêm correction để bot học cách trả lời đúng.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Ưu tiên</Label>
              <Input type="number" value={formPriority} onChange={(e) => setFormPriority(Number(e.target.value))} className="w-20 h-8 text-xs" min={0} max={100} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Bật</Label>
              <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
            </div>
          </div>

          <Button className="w-full gap-2" onClick={handleSave} disabled={!formTitle.trim() || !formContent.trim()}>
            <Save className="h-4 w-4" />
            {editingItem ? "Cập nhật" : "Tạo mới"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {!compact && (
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              {title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        )}
        {formDialog}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map(([key, cfg]) => (
            <div key={key} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs bg-card">
              <cfg.icon className={`h-3.5 w-3.5 ${cfg.color.split(" ")[0]}`} />
              {cfg.label} ({counts[key] || 0})
            </div>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Tìm kiếm..." className="pl-9 h-9 text-sm" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Brain className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Chưa có entry nào</p>
          <p className="text-xs mt-1">Thêm nội dung để tách rõ runtime memory và skill bindings của agent bridge</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((item) => {
            const cfg = categoryConfig[item.category as MemoryCategory] || categoryConfig.rule;
            const Icon = cfg.icon;
            return (
              <div key={item.id} className={`rounded-lg border bg-card p-4 transition-all ${!item.enabled ? "opacity-50" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                      <Badge variant="outline" className="text-[10px]">{cfg.label}</Badge>
                      {item.priority > 0 && <Badge variant="secondary" className="text-[10px]">P{item.priority}</Badge>}
                      {item.source_conversation_id && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <MessageSquareWarning className="h-2.5 w-2.5" />
                          From conversation
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line line-clamp-3">{item.content}</p>
                    {item.category === "skill" && (item.metadata as any)?.endpoint && (
                      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        <code className="bg-muted px-1 rounded">{(item.metadata as any).endpoint}</code>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch checked={item.enabled} onCheckedChange={(v) => toggleMutation.mutate({ id: item.id, enabled: v })} className="scale-[0.7]" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(item)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />Chỉnh sửa
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deleteMutation.mutate(item.id)} className="text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-2" />Xóa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
