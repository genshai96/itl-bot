import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent as AlertContent,
  AlertDialogDescription as AlertDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertTitle,
} from "@/components/ui/alert-dialog";
import {
  useToolDefinitions, useCreateToolDefinition, useUpdateToolDefinition, useDeleteToolDefinition,
} from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sliders, Plus, Trash2, Pencil, Loader2, Sparkles, Code2, Eye, EyeOff,
} from "lucide-react";

interface ToolManagerProps {
  tenantId: string;
  tenantName: string;
}

interface ToolFormData {
  name: string;
  tool_id: string;
  description: string;
  endpoint: string;
  input_schema: string;
}

const emptyForm: ToolFormData = {
  name: "", tool_id: "", description: "", endpoint: "", input_schema: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
};

const ToolManager = ({ tenantId, tenantName }: ToolManagerProps) => {
  const { data: toolDefs, refetch } = useToolDefinitions(tenantId);
  const createTool = useCreateToolDefinition();
  const updateTool = useUpdateToolDefinition();
  const deleteTool = useDeleteToolDefinition();

  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<ToolFormData>(emptyForm);
  const [showSchema, setShowSchema] = useState<string | null>(null);

  // AI generation
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<any[] | null>(null);

  const openCreate = () => {
    setForm(emptyForm);
    setEditId(null);
    setAiResults(null);
    setAiPrompt("");
    setShowCreate(true);
  };

  const openEdit = (tool: any) => {
    setForm({
      name: tool.name,
      tool_id: tool.tool_id,
      description: tool.description || "",
      endpoint: tool.endpoint,
      input_schema: JSON.stringify(tool.input_schema || {}, null, 2),
    });
    setEditId(tool.id);
    setAiResults(null);
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.tool_id.trim() || !form.endpoint.trim()) {
      toast.error("Name, Tool ID và Endpoint là bắt buộc");
      return;
    }

    let schema: any;
    try {
      schema = JSON.parse(form.input_schema || "{}");
    } catch {
      toast.error("Input Schema JSON không hợp lệ");
      return;
    }

    try {
      if (editId) {
        await updateTool.mutateAsync({
          id: editId,
          updates: {
            name: form.name.trim(),
            tool_id: form.tool_id.trim(),
            description: form.description.trim(),
            endpoint: form.endpoint.trim(),
            input_schema: schema,
          },
        });
        toast.success("Đã cập nhật tool");
      } else {
        await createTool.mutateAsync({
          tenant_id: tenantId,
          name: form.name.trim(),
          tool_id: form.tool_id.trim(),
          description: form.description.trim(),
          endpoint: form.endpoint.trim(),
          input_schema: schema,
          enabled: true,
        });
        toast.success("Đã tạo tool mới");
      }
      setShowCreate(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Lỗi lưu tool");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTool.mutateAsync({ id: deleteId, tenantId });
      toast.success("Đã xóa tool");
      setDeleteId(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleTool = async (toolId: string, enabled: boolean) => {
    try {
      await updateTool.mutateAsync({ id: toolId, updates: { enabled } });
    } catch {
      toast.error("Lỗi cập nhật tool");
    }
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Nhập mô tả tool cần tạo");
      return;
    }
    setAiLoading(true);
    setAiResults(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-tools", {
        body: { description: aiPrompt, tenant_name: tenantName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAiResults(data.tools || []);
      toast.success(`AI đã tạo ${data.tools?.length || 0} tool definitions`);
    } catch (err: any) {
      toast.error(err.message || "AI generation failed");
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiTool = (tool: any) => {
    setForm({
      name: tool.name || "",
      tool_id: tool.tool_id || "",
      description: tool.description || "",
      endpoint: tool.endpoint || "",
      input_schema: JSON.stringify(tool.input_schema || {}, null, 2),
    });
    setAiResults(null);
  };

  const saveAiToolDirectly = async (tool: any) => {
    try {
      await createTool.mutateAsync({
        tenant_id: tenantId,
        name: tool.name,
        tool_id: tool.tool_id,
        description: tool.description || "",
        endpoint: tool.endpoint,
        input_schema: tool.input_schema || {},
        enabled: true,
      });
      toast.success(`Đã thêm tool: ${tool.name}`);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Sliders className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Tool Definitions — {tenantName}</h3>
              <p className="text-xs text-muted-foreground">Bot sẽ gọi tools khi cần xử lý tác vụ cụ thể</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => { setShowCreate(true); setEditId(null); setForm(emptyForm); setAiResults(null); setAiPrompt(""); }}>
              <Sparkles className="h-3.5 w-3.5" />
              AI Generate
            </Button>
            <Button size="sm" className="gap-2 glow-primary" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              Thêm Tool
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {(!toolDefs || toolDefs.length === 0) && (
            <div className="text-center py-8 space-y-3">
              <Sliders className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Chưa có tool nào. Thêm tool thủ công hoặc dùng AI để tạo nhanh.</p>
            </div>
          )}
          {toolDefs?.map((tool) => (
            <div key={tool.id} className="rounded-lg border px-4 py-3.5 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{tool.name}</p>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tool.tool_id}</span>
                  </div>
                  {tool.description && <p className="text-xs text-muted-foreground line-clamp-1">{tool.description}</p>}
                  <p className="text-xs text-muted-foreground font-mono truncate">{tool.endpoint}</p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setShowSchema(showSchema === tool.id ? null : tool.id)}
                  >
                    {showSchema === tool.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Switch checked={tool.enabled ?? true} onCheckedChange={(v) => toggleTool(tool.id, v)} />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tool)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(tool.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {showSchema === tool.id && (
                <pre className="mt-3 rounded-lg bg-muted p-3 text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
                  {JSON.stringify(tool.input_schema, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Chỉnh sửa Tool" : "Thêm Tool mới"}</DialogTitle>
            <DialogDescription>
              {editId ? "Cập nhật thông tin tool definition" : "Tạo tool thủ công hoặc dùng AI để generate nhanh"}
            </DialogDescription>
          </DialogHeader>

          {/* AI Generation Section */}
          {!editId && (
            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-primary">AI Tool Generator</span>
              </div>
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="VD: Tạo tool kiểm tra trạng thái đơn hàng bằng order ID và email. Thêm tool tra cứu sản phẩm theo tên hoặc mã SKU."
                rows={3}
                className="text-sm"
              />
              <Button size="sm" className="gap-2" onClick={generateWithAI} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiLoading ? "Đang tạo..." : "Generate với AI"}
              </Button>

              {aiResults && aiResults.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-medium text-muted-foreground">AI đã tạo {aiResults.length} tool:</p>
                  {aiResults.map((tool, i) => (
                    <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{tool.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{tool.tool_id}</p>
                        </div>
                        <div className="flex gap-1.5">
                          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => applyAiTool(tool)}>
                            Chỉnh sửa
                          </Button>
                          <Button size="sm" className="text-xs h-7 gap-1" onClick={() => saveAiToolDirectly(tool)}>
                            <Plus className="h-3 w-3" />Thêm
                          </Button>
                        </div>
                      </div>
                      {tool.description && <p className="text-xs text-muted-foreground">{tool.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Manual Form */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Tên Tool</Label>
                <Input value={form.name} onChange={(e) => {
                  const name = e.target.value;
                  const autoId = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
                  setForm({ ...form, name, ...(editId ? {} : { tool_id: autoId }) });
                }} placeholder="Check Order Status" maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Tool ID</Label>
                <Input value={form.tool_id} onChange={(e) => setForm({ ...form, tool_id: e.target.value })} placeholder="check_order_status" className="font-mono text-sm" maxLength={100} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Mô tả (AI sẽ đọc để quyết định khi nào gọi tool)</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Look up the current status of a customer order..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Endpoint URL</Label>
              <Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://api.example.com/tools/check_order" className="font-mono text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-2"><Code2 className="h-3.5 w-3.5" />Input Schema (JSON)</Label>
              <Textarea
                value={form.input_schema}
                onChange={(e) => setForm({ ...form, input_schema: e.target.value })}
                rows={6}
                className="font-mono text-xs"
                placeholder='{"type":"object","properties":{}}'
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Hủy</Button>
            <Button size="sm" className="glow-primary gap-2" onClick={handleSave} disabled={createTool.isPending || updateTool.isPending}>
              {(createTool.isPending || updateTool.isPending) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editId ? "Cập nhật" : "Tạo Tool"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertContent>
          <AlertDialogHeader>
            <AlertTitle>Xác nhận xóa tool?</AlertTitle>
            <AlertDesc>Tool sẽ bị xóa khỏi danh sách. Bot sẽ không thể gọi tool này nữa.</AlertDesc>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertContent>
      </AlertDialog>
    </div>
  );
};

export default ToolManager;
