import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { fetchProviderModels, type ModelInfo } from "@/lib/api";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useTenant, useTenantConfig, useUpdateTenantConfig,
  useKbDocuments, useToolDefinitions, useConversations,
} from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  ArrowLeft, Brain, Code2, Copy, Check, FileText, Globe, Key,
  Palette, Save, Settings, Shield, Sliders, TestTube,
  Trash2, Eye, CheckCircle2, User, Loader2,
} from "lucide-react";

const TenantDetail = () => {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: tenant, isLoading: loadingTenant } = useTenant(tenantId || "");
  const { data: config, isLoading: loadingConfig } = useTenantConfig(tenantId || "");
  const { data: kbDocs } = useKbDocuments(tenantId || "");
  const { data: toolDefs } = useToolDefinitions(tenantId || "");
  const { data: conversations } = useConversations(tenantId);
  const updateConfig = useUpdateTenantConfig();

  // Local state synced from DB
  const [provider, setProvider] = useState({
    endpoint: "", apiKey: "", model: "", temperature: "0.3", maxTokens: "2048",
  });
  const [widgetConfig, setWidgetConfig] = useState({
    primaryColor: "#0d9488", position: "bottom-right" as "bottom-right" | "bottom-left",
    title: "AI Support", subtitle: "", placeholder: "", welcomeMessage: "",
    collectName: true, collectEmail: true, collectPhone: false,
    showPoweredBy: true, autoOpen: false, autoOpenDelay: 5,
  });
  const [security, setSecurity] = useState({
    confidenceThreshold: 0.6, maxToolRetries: 2, piiMasking: true, promptInjectionDefense: true,
  });
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantDomain, setTenantDomain] = useState("");

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [connectionOk, setConnectionOk] = useState(false);
  const [searchModel, setSearchModel] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync DB config to local state
  useEffect(() => {
    if (config) {
      setProvider({
        endpoint: config.provider_endpoint || "",
        apiKey: config.provider_api_key || "",
        model: config.provider_model || "",
        temperature: String(config.temperature ?? 0.3),
        maxTokens: String(config.max_tokens ?? 2048),
      });
      setWidgetConfig({
        primaryColor: config.widget_primary_color || "#0d9488",
        position: (config.widget_position as any) || "bottom-right",
        title: config.widget_title || "AI Support",
        subtitle: config.widget_subtitle || "",
        placeholder: config.widget_placeholder || "",
        welcomeMessage: config.widget_welcome_message || "",
        collectName: config.widget_collect_name ?? true,
        collectEmail: config.widget_collect_email ?? true,
        collectPhone: config.widget_collect_phone ?? false,
        showPoweredBy: config.widget_show_powered_by ?? true,
        autoOpen: config.widget_auto_open ?? false,
        autoOpenDelay: config.widget_auto_open_delay ?? 5,
      });
      setSecurity({
        confidenceThreshold: config.confidence_threshold ?? 0.6,
        maxToolRetries: config.max_tool_retries ?? 2,
        piiMasking: config.pii_masking ?? true,
        promptInjectionDefense: config.prompt_injection_defense ?? true,
      });
      setSystemPrompt(config.system_prompt || "");
    }
  }, [config]);

  useEffect(() => {
    if (tenant) {
      setTenantName(tenant.name);
      setTenantDomain(tenant.domain || "");
    }
  }, [tenant]);

  const fetchModels = async () => {
    if (!provider.endpoint || !provider.apiKey) { toast.error("Nhập endpoint và API key"); return; }
    setLoadingModels(true); setConnectionOk(false);
    try {
      const result = await fetchProviderModels(provider.endpoint, provider.apiKey);
      setModels(result); setConnectionOk(true);
      toast.success(`${result.length} models`);
    } catch (err: any) { toast.error(err.message || "Lỗi kết nối"); }
    finally { setLoadingModels(false); }
  };

  const saveProviderConfig = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      await updateConfig.mutateAsync({
        tenantId,
        config: {
          provider_endpoint: provider.endpoint,
          provider_api_key: provider.apiKey,
          provider_model: provider.model,
          temperature: parseFloat(provider.temperature) || 0.3,
          max_tokens: parseInt(provider.maxTokens) || 2048,
          system_prompt: systemPrompt,
        },
      });
      toast.success("Đã lưu cấu hình AI Provider");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const saveWidgetConfig = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      await updateConfig.mutateAsync({
        tenantId,
        config: {
          widget_primary_color: widgetConfig.primaryColor,
          widget_position: widgetConfig.position,
          widget_title: widgetConfig.title,
          widget_subtitle: widgetConfig.subtitle,
          widget_placeholder: widgetConfig.placeholder,
          widget_welcome_message: widgetConfig.welcomeMessage,
          widget_collect_name: widgetConfig.collectName,
          widget_collect_email: widgetConfig.collectEmail,
          widget_collect_phone: widgetConfig.collectPhone,
          widget_show_powered_by: widgetConfig.showPoweredBy,
          widget_auto_open: widgetConfig.autoOpen,
          widget_auto_open_delay: widgetConfig.autoOpenDelay,
        },
      });
      toast.success("Đã lưu widget config");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const saveSecurityConfig = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      await updateConfig.mutateAsync({
        tenantId,
        config: {
          confidence_threshold: security.confidenceThreshold,
          max_tool_retries: security.maxToolRetries,
          pii_masking: security.piiMasking,
          prompt_injection_defense: security.promptInjectionDefense,
        },
      });
      toast.success("Đã lưu security config");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const saveTenantInfo = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("tenants").update({ name: tenantName, domain: tenantDomain || null }).eq("id", tenantId);
      if (error) throw error;
      toast.success("Đã lưu thông tin tenant");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const toggleTool = async (toolId: string, enabled: boolean) => {
    const { error } = await supabase.from("tool_definitions").update({ enabled }).eq("id", toolId);
    if (error) toast.error("Lỗi cập nhật tool");
  };

  const deleteTool = async (toolId: string) => {
    const { error } = await supabase.from("tool_definitions").delete().eq("id", toolId);
    if (error) toast.error("Lỗi xóa tool");
  };

  if (loadingTenant || loadingConfig) {
    return (
      <AdminLayout>
        <div className="space-y-6 animate-slide-in">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!tenant) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-muted-foreground">
          Tenant không tồn tại
          <br />
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/tenants")}>← Quay lại</Button>
        </div>
      </AdminLayout>
    );
  }

  const embedCode = `<!-- AI Support Widget - ${tenant.name} -->
<script>
  window.AISupportConfig = {
    tenantId: "${tenant.slug}",
    primaryColor: "${widgetConfig.primaryColor}",
    position: "${widgetConfig.position}",
    title: "${widgetConfig.title}",
    subtitle: "${widgetConfig.subtitle}",
    placeholder: "${widgetConfig.placeholder}",
    welcomeMessage: "${widgetConfig.welcomeMessage}",
    collectName: ${widgetConfig.collectName},
    collectEmail: ${widgetConfig.collectEmail},
    collectPhone: ${widgetConfig.collectPhone},
    autoOpen: ${widgetConfig.autoOpen},
    autoOpenDelay: ${widgetConfig.autoOpenDelay},
  };
</script>
<script src="${window.location.origin}/widget.js" async></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AdminLayout>
      <div className="space-y-6 animate-slide-in">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate("/tenants")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3 flex-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
              {tenant.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{tenant.name}</h1>
              <p className="text-xs text-muted-foreground font-mono">{tenant.slug} · {tenant.domain || "—"}</p>
            </div>
          </div>
          <span className={tenant.status === "active" ? "badge-active" : "badge-pending"}>{tenant.status}</span>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="overview" className="gap-2 text-xs"><Settings className="h-3.5 w-3.5" />Tổng quan</TabsTrigger>
            <TabsTrigger value="provider" className="gap-2 text-xs"><Brain className="h-3.5 w-3.5" />AI Provider</TabsTrigger>
            <TabsTrigger value="tools" className="gap-2 text-xs"><Sliders className="h-3.5 w-3.5" />Tools</TabsTrigger>
            <TabsTrigger value="knowledge" className="gap-2 text-xs"><FileText className="h-3.5 w-3.5" />Knowledge Base</TabsTrigger>
            <TabsTrigger value="widget" className="gap-2 text-xs"><Code2 className="h-3.5 w-3.5" />Widget & Embed</TabsTrigger>
            <TabsTrigger value="security" className="gap-2 text-xs"><Shield className="h-3.5 w-3.5" />Security</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="stat-card">
                <p className="text-sm text-muted-foreground">Conversations</p>
                <p className="text-3xl font-bold mt-1">{conversations?.length || 0}</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-muted-foreground">KB Documents</p>
                <p className="text-3xl font-bold mt-1">{kbDocs?.length || 0}</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-muted-foreground">Tools</p>
                <p className="text-3xl font-bold mt-1">{toolDefs?.length || 0}</p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <h3 className="text-sm font-semibold">Thông tin Tenant</h3>
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
                <Button size="sm" className="gap-2 glow-primary" onClick={saveTenantInfo} disabled={saving}>
                  <Save className="h-3.5 w-3.5" />Lưu
                </Button>
              </div>
            </div>
            {/* System Prompt */}
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <h3 className="text-sm font-semibold">System Prompt</h3>
              <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={5} placeholder="Nhập system prompt cho AI bot..." />
              <div className="flex justify-end">
                <Button size="sm" className="gap-2 glow-primary" onClick={saveProviderConfig} disabled={saving}>
                  <Save className="h-3.5 w-3.5" />Lưu
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* AI Provider */}
          <TabsContent value="provider" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Globe className="h-5 w-5 text-primary" /></div>
                <div>
                  <h3 className="text-sm font-semibold">API Configuration — {tenant.name}</h3>
                  <p className="text-xs text-muted-foreground">OpenAI-compatible endpoint</p>
                </div>
                {connectionOk && <span className="ml-auto flex items-center gap-1.5 text-xs text-success font-medium"><CheckCircle2 className="h-3.5 w-3.5" />Connected</span>}
              </div>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">API Endpoint</Label>
                  <Input value={provider.endpoint} onChange={(e) => setProvider({ ...provider, endpoint: e.target.value })} placeholder="https://api.openai.com/v1" className="font-mono text-sm h-10" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-2"><Key className="h-3.5 w-3.5" />API Key</Label>
                  <Input type="password" value={provider.apiKey} onChange={(e) => setProvider({ ...provider, apiKey: e.target.value })} placeholder="sk-..." className="font-mono text-sm h-10" />
                </div>
                <div className="flex gap-3">
                  <Button onClick={fetchModels} variant="outline" size="sm" className="gap-2 text-xs" disabled={loadingModels}>
                    <TestTube className="h-3.5 w-3.5" />
                    {loadingModels ? "Đang tải..." : "Test & Fetch Models"}
                  </Button>
                </div>
                {models.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Model ({models.length})</Label>
                      <Input value={searchModel} onChange={(e) => setSearchModel(e.target.value)} placeholder="Tìm model..." className="h-8 w-48 text-xs" />
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                      {models.filter((m) => m.id.toLowerCase().includes(searchModel.toLowerCase())).map((model) => (
                        <button key={model.id} onClick={() => setProvider({ ...provider, model: model.id })}
                          className={`rounded-lg border px-3 py-2 text-left transition-all ${provider.model === model.id ? "border-primary bg-primary/5 text-primary" : "hover:border-primary/30 hover:bg-muted/50"}`}>
                          <p className="text-xs font-mono truncate">{model.id}</p>
                          {model.owned_by && <p className="text-[10px] text-muted-foreground mt-0.5">{model.owned_by}</p>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Temperature</Label>
                    <Input type="number" step="0.1" min="0" max="2" value={provider.temperature} onChange={(e) => setProvider({ ...provider, temperature: e.target.value })} className="font-mono text-sm h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Max Tokens</Label>
                    <Input type="number" value={provider.maxTokens} onChange={(e) => setProvider({ ...provider, maxTokens: e.target.value })} className="font-mono text-sm h-10" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="gap-2 glow-primary" onClick={saveProviderConfig} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Lưu cấu hình
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Tools */}
          <TabsContent value="tools" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Sliders className="h-5 w-5 text-primary" /></div>
                  <div>
                    <h3 className="text-sm font-semibold">Tool Allowlist — {tenant.name}</h3>
                    <p className="text-xs text-muted-foreground">Bot chỉ được gọi tool trong danh sách này</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {(!toolDefs || toolDefs.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-6">Chưa có tool nào</p>
                )}
                {toolDefs?.map((tool) => (
                  <div key={tool.id} className="flex items-center justify-between rounded-lg border px-4 py-3.5 hover:bg-muted/30 transition-colors">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{tool.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{tool.endpoint}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={tool.enabled ?? true} onCheckedChange={(checked) => toggleTool(tool.id, checked)} />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteTool(tool.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Knowledge Base */}
          <TabsContent value="knowledge" className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Knowledge Base — {tenant.name}</h3>
              <Button size="sm" className="gap-2 glow-primary" onClick={() => navigate("/knowledge")}>
                <FileText className="h-3.5 w-3.5" />Quản lý KB
              </Button>
            </div>
            <div className="rounded-lg border bg-card">
              {(!kbDocs || kbDocs.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-8">Chưa có tài liệu. Vào trang Knowledge Base để upload.</p>
              )}
              {kbDocs?.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between border-b last:border-0 px-6 py-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><FileText className="h-4 w-4 text-primary" /></div>
                    <div>
                      <p className="text-sm font-medium">{doc.name}</p>
                      <p className="text-[11px] text-muted-foreground">{doc.chunk_count || 0} chunks · {format(new Date(doc.updated_at), "dd/MM/yyyy")}</p>
                    </div>
                  </div>
                  <span className={doc.status === "indexed" ? "badge-active" : "badge-pending"}>{doc.status}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Widget & Embed */}
          <TabsContent value="widget" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-lg border bg-card p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Palette className="h-5 w-5 text-primary" /></div>
                  <div>
                    <h3 className="text-sm font-semibold">Tùy chỉnh Widget</h3>
                    <p className="text-xs text-muted-foreground">Giao diện chat popup</p>
                  </div>
                </div>
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Màu chính</Label>
                      <div className="flex gap-2">
                        <input type="color" value={widgetConfig.primaryColor} onChange={(e) => setWidgetConfig({ ...widgetConfig, primaryColor: e.target.value })} className="h-10 w-12 rounded-md border cursor-pointer" />
                        <Input value={widgetConfig.primaryColor} onChange={(e) => setWidgetConfig({ ...widgetConfig, primaryColor: e.target.value })} className="font-mono text-sm h-10 flex-1" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Vị trí</Label>
                      <div className="flex gap-2">
                        {(["bottom-right", "bottom-left"] as const).map((pos) => (
                          <button key={pos} onClick={() => setWidgetConfig({ ...widgetConfig, position: pos })}
                            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${widgetConfig.position === pos ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50"}`}>
                            {pos === "bottom-right" ? "Phải ↘" : "Trái ↙"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2"><Label className="text-xs">Tiêu đề</Label><Input value={widgetConfig.title} onChange={(e) => setWidgetConfig({ ...widgetConfig, title: e.target.value })} className="h-10" maxLength={100} /></div>
                  <div className="space-y-2"><Label className="text-xs">Phụ đề</Label><Input value={widgetConfig.subtitle} onChange={(e) => setWidgetConfig({ ...widgetConfig, subtitle: e.target.value })} className="h-10" maxLength={200} /></div>
                  <div className="space-y-2"><Label className="text-xs">Tin nhắn chào mừng</Label><Textarea value={widgetConfig.welcomeMessage} onChange={(e) => setWidgetConfig({ ...widgetConfig, welcomeMessage: e.target.value })} rows={2} /></div>
                  <div className="space-y-2"><Label className="text-xs">Placeholder</Label><Input value={widgetConfig.placeholder} onChange={(e) => setWidgetConfig({ ...widgetConfig, placeholder: e.target.value })} className="h-10" maxLength={100} /></div>
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2"><User className="h-4 w-4 text-primary" /><Label className="text-xs font-semibold">Thu thập thông tin End User</Label></div>
                    {([{ key: "collectName" as const, label: "Họ tên" }, { key: "collectEmail" as const, label: "Email" }, { key: "collectPhone" as const, label: "SĐT" }]).map((f) => (
                      <div key={f.key} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                        <span className="text-sm">{f.label}</span>
                        <Switch checked={widgetConfig[f.key]} onCheckedChange={(v) => setWidgetConfig({ ...widgetConfig, [f.key]: v })} />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                      <div><span className="text-sm">Tự động mở</span><p className="text-[11px] text-muted-foreground">Sau {widgetConfig.autoOpenDelay}s</p></div>
                      <Switch checked={widgetConfig.autoOpen} onCheckedChange={(v) => setWidgetConfig({ ...widgetConfig, autoOpen: v })} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                      <span className="text-sm">Powered by</span>
                      <Switch checked={widgetConfig.showPoweredBy} onCheckedChange={(v) => setWidgetConfig({ ...widgetConfig, showPoweredBy: v })} />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" className="gap-2 glow-primary" onClick={saveWidgetConfig} disabled={saving}>
                    <Save className="h-3.5 w-3.5" />Lưu Widget
                  </Button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-lg border bg-card p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Code2 className="h-5 w-5 text-primary" /></div>
                      <div><h3 className="text-sm font-semibold">Embed Code</h3><p className="text-xs text-muted-foreground">Copy vào website</p></div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleCopy}>
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Đã copy!" : "Copy"}
                    </Button>
                  </div>
                  <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto leading-relaxed max-h-64 overflow-y-auto"><code>{embedCode}</code></pre>
                </div>
                <div className="rounded-lg border bg-card p-6 space-y-4">
                  <h3 className="text-sm font-semibold">Preview</h3>
                  <div className="relative bg-muted/50 rounded-lg h-80 flex items-end p-4" style={{ justifyContent: widgetConfig.position === "bottom-right" ? "flex-end" : "flex-start" }}>
                    <div className="w-72 rounded-2xl shadow-lg overflow-hidden border" style={{ boxShadow: `0 8px 30px ${widgetConfig.primaryColor}20` }}>
                      <div className="px-5 py-4" style={{ background: widgetConfig.primaryColor }}>
                        <h4 className="text-sm font-semibold text-white">{widgetConfig.title}</h4>
                        {widgetConfig.subtitle && <p className="text-xs mt-0.5 text-white/80">{widgetConfig.subtitle}</p>}
                      </div>
                      <div className="bg-card p-4 space-y-3 h-40">
                        <div className="chat-bubble-bot text-xs">{widgetConfig.welcomeMessage || "Xin chào!"}</div>
                      </div>
                      <div className="border-t px-4 py-3 bg-card">
                        <div className="flex items-center gap-2 rounded-full border px-4 py-2 text-xs text-muted-foreground">{widgetConfig.placeholder || "Nhập tin nhắn..."}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Shield className="h-5 w-5 text-primary" /></div>
                <div><h3 className="text-sm font-semibold">Security — {tenant.name}</h3><p className="text-xs text-muted-foreground">Guardrails và policy</p></div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Confidence Threshold</Label>
                  <Input type="number" step="0.05" min="0" max="1" value={security.confidenceThreshold} onChange={(e) => setSecurity({ ...security, confidenceThreshold: parseFloat(e.target.value) || 0.6 })} className="font-mono text-sm h-10 max-w-xs" />
                  <p className="text-[11px] text-muted-foreground">Handoff khi confidence dưới ngưỡng</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Max Tool Retries</Label>
                  <Input type="number" min="0" max="5" value={security.maxToolRetries} onChange={(e) => setSecurity({ ...security, maxToolRetries: parseInt(e.target.value) || 2 })} className="font-mono text-sm h-10 max-w-xs" />
                </div>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div><p className="text-sm font-medium">PII Masking</p><p className="text-xs text-muted-foreground">Ẩn thông tin nhạy cảm</p></div>
                  <Switch checked={security.piiMasking} onCheckedChange={(v) => setSecurity({ ...security, piiMasking: v })} />
                </div>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div><p className="text-sm font-medium">Prompt Injection Defense</p></div>
                  <Switch checked={security.promptInjectionDefense} onCheckedChange={(v) => setSecurity({ ...security, promptInjectionDefense: v })} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="gap-2 glow-primary" onClick={saveSecurityConfig} disabled={saving}>
                  <Save className="h-3.5 w-3.5" />Lưu
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default TenantDetail;
