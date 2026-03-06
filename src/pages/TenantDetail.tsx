import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { fetchProviderModels, sendChatMessage, sendChatMessageStream, uploadChatAttachment, extractFileContent, type ModelInfo } from "@/lib/api";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useTenant, useTenantConfig, useUpdateTenantConfig,
  useKbDocuments, useToolDefinitions, useConversations, useDeleteTenant,
} from "@/hooks/use-data";
import ToolManager from "@/components/tools/ToolManager";
import BotMemoryPanel from "@/components/memory/BotMemoryPanel";
import { ChatMessageRenderer } from "@/components/chat/ChatMessageRenderer";
import { ChatFileUpload, type ChatAttachment } from "@/components/chat/ChatFileUpload";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  ArrowLeft, Brain, Code2, Copy, Check, FileText, Globe, Key,
  Palette, Save, Settings, Shield, Sliders, TestTube,
  Trash2, User, Loader2, CheckCircle2, Send, Bot, MessageSquare,
  Rocket, ServerCog, Workflow,
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
  const deleteTenantMut = useDeleteTenant();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Local state synced from DB
  const [provider, setProvider] = useState({
    endpoint: "", apiKey: "", model: "", temperature: "0.3", maxTokens: "2048",
  });
  const [widgetConfig, setWidgetConfig] = useState({
    primaryColor: "#0d9488", position: "bottom-right" as "bottom-right" | "bottom-left",
    title: "AI Support", subtitle: "", placeholder: "", welcomeMessage: "",
    collectName: true, collectEmail: true, collectPhone: false, collectRole: false,
    roleOptionsText: "Người tạo đơn hàng, Kế toán, Quản lý",
    showPoweredBy: true, autoOpen: false, autoOpenDelay: 5,
  });
  const [security, setSecurity] = useState({
    confidenceThreshold: 0.6, maxToolRetries: 2, piiMasking: true, promptInjectionDefense: true,
  });
  const [agentCore, setAgentCore] = useState({
    memoryV2Enabled: false,
    skillsRuntimeEnabled: false,
    mcpGatewayEnabled: false,
    memoryDecayDays: 30,
    memoryMinConfidence: 0.55,
  });
  const [bootstrapBody, setBootstrapBody] = useState("");
  const [bootstrapLoading, setBootstrapLoading] = useState<"validate" | "bootstrap" | null>(null);
  const [bootstrapResult, setBootstrapResult] = useState<any>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<{
    skills: any[];
    mcpState: any[];
    bootstrapRuns: any[];
  }>({ skills: [], mcpState: [], bootstrapRuns: [] });
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantDomain, setTenantDomain] = useState("");

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [connectionOk, setConnectionOk] = useState(false);
  const [searchModel, setSearchModel] = useState("");
  const [saving, setSaving] = useState(false);

  // Test chat state
  const [testMessages, setTestMessages] = useState<{ role: string; content: string; imageUrls?: string[] }[]>([]);
  const [testInput, setTestInput] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testConvId, setTestConvId] = useState<string | undefined>(undefined);
  const [testAttachments, setTestAttachments] = useState<ChatAttachment[]>([]);
  const testEndRef = useRef<HTMLDivElement>(null);

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
        collectRole: (config as any).widget_collect_role ?? false,
        roleOptionsText: Array.isArray((config as any).widget_role_options)
          ? (config as any).widget_role_options.join(", ")
          : "Người tạo đơn hàng, Kế toán, Quản lý",
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
      setAgentCore({
        memoryV2Enabled: (config as any).memory_v2_enabled ?? false,
        skillsRuntimeEnabled: (config as any).skills_runtime_enabled ?? false,
        mcpGatewayEnabled: (config as any).mcp_gateway_enabled ?? false,
        memoryDecayDays: Number((config as any).memory_decay_days ?? 30),
        memoryMinConfidence: Number((config as any).memory_min_confidence ?? 0.55),
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

  useEffect(() => {
    if (!tenantId) return;
    setBootstrapBody(JSON.stringify({
      tenant_id: tenantId,
      mode: "bootstrap",
      rollback_on_error: true,
      memory: {
        enable_v2: true,
        decay_days: agentCore.memoryDecayDays,
        min_confidence: agentCore.memoryMinConfidence,
      },
      skills: {
        enable_runtime: true,
        packs: [],
      },
      mcp: {
        enable_gateway: true,
        servers: [],
      },
      governance: {
        confidence_threshold: security.confidenceThreshold,
        max_tool_retries: security.maxToolRetries,
        prompt_injection_defense: security.promptInjectionDefense,
        pii_masking: security.piiMasking,
      },
    }, null, 2));
  }, [tenantId]);

  useEffect(() => {
    testEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [testMessages]);



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
          widget_collect_role: widgetConfig.collectRole,
          widget_role_options: widgetConfig.roleOptionsText
            .split(",")
            .map((x: string) => x.trim())
            .filter(Boolean),
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

  const saveAgentCoreConfig = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      await updateConfig.mutateAsync({
        tenantId,
        config: {
          memory_v2_enabled: agentCore.memoryV2Enabled,
          skills_runtime_enabled: agentCore.skillsRuntimeEnabled,
          mcp_gateway_enabled: agentCore.mcpGatewayEnabled,
          memory_decay_days: agentCore.memoryDecayDays,
          memory_min_confidence: agentCore.memoryMinConfidence,
        } as any,
      });
      toast.success("Đã lưu cấu hình Agent Core");
    } catch (err: any) {
      toast.error(err.message || "Lưu Agent Core thất bại");
    } finally {
      setSaving(false);
    }
  };

  const runBootstrapAction = async (action: "validate" | "bootstrap") => {
    if (!tenantId) return;
    setBootstrapLoading(action);
    try {
      const parsed = JSON.parse(bootstrapBody || "{}");
      parsed.tenant_id = tenantId;

      const functionName = action === "validate" ? "bootstrap-validate" : "bootstrap";
      if (action === "bootstrap") {
        parsed.mode = "bootstrap";
      }

      const { data, error } = await supabase.functions.invoke(functionName, { body: parsed });
      if (error) throw error;

      setBootstrapResult(data);
      toast.success(action === "validate" ? "Validate thành công" : "Bootstrap hoàn tất");
      await loadRuntimeSnapshot();
    } catch (err: any) {
      toast.error(err.message || `Lỗi ${action}`);
      setBootstrapResult({ ok: false, error: err.message || "Unknown error" });
    } finally {
      setBootstrapLoading(null);
    }
  };

  const loadRuntimeSnapshot = async () => {
    if (!tenantId) return;
    setRuntimeLoading(true);
    try {
      const [{ data: skillsData }, { data: mcpData }, { data: runsData }] = await Promise.all([
        supabase.functions.invoke("skills", {
          body: { action: "list_tenant", tenant_id: tenantId },
        }),
        supabase.functions.invoke("mcp-gateway", {
          body: { action: "state", tenant_id: tenantId },
        }),
        supabase
          .from("tenant_bootstrap_runs" as any)
          .select("id, mode, status, started_at, finished_at, error_message")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      setRuntimeSnapshot({
        skills: (skillsData as any)?.bindings || [],
        mcpState: (mcpData as any)?.state || [],
        bootstrapRuns: runsData || [],
      });
    } catch (err) {
      console.error("Runtime snapshot error", err);
    } finally {
      setRuntimeLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "agent-core" && tenantId) {
      loadRuntimeSnapshot();
    }
  }, [activeTab, tenantId]);

  const handleDeleteTenant = async () => {
    if (!tenantId) return;
    try {
      await deleteTenantMut.mutateAsync(tenantId);
      toast.success("Đã xóa tenant");
      navigate("/tenants");
    } catch (err: any) {
      toast.error(err.message || "Xóa thất bại");
    }
  };


  // Test chat
  const sendTestMessage = async () => {
    if ((!testInput.trim() && testAttachments.length === 0) || !tenantId) return;
    const userMsg = testInput.trim();
    const msgAttachments = [...testAttachments];

    const imagePreviewUrls = msgAttachments
      .filter((a) => a.type === "image" && a.preview)
      .map((a) => a.preview!);

    setTestInput("");
    setTestAttachments([]);
    setTestMessages((prev) => [...prev, {
      role: "user",
      content: userMsg || `📎 ${msgAttachments.map((a) => a.file.name).join(", ")}`,
      imageUrls: imagePreviewUrls,
    }]);
    setTestSending(true);

    try {
      // Upload & extract files
      let processedAttachments: Array<{ url: string; type: string; content?: string; strategy?: string }> = [];
      if (msgAttachments.length > 0) {
        const uploadedUrls: string[] = [];
        for (const att of msgAttachments) {
          try {
            const url = await uploadChatAttachment(att.file, tenantId);
            uploadedUrls.push(url);
          } catch (err) {
            console.error("Upload failed:", err);
            toast.error(`Upload thất bại: ${att.file.name}`);
          }
        }
        if (uploadedUrls.length > 0) {
          try {
            const extracted = await extractFileContent(uploadedUrls, tenantId);
            processedAttachments = extracted.results.map((r) => ({
              url: r.url, type: r.type, content: r.content, strategy: r.strategy,
            }));
          } catch {
            processedAttachments = uploadedUrls.map((url) => ({ url, type: "unknown" }));
          }
        }
      }

      // Add empty bot message placeholder for streaming
      const botIdx = testMessages.length + 1; // index after user msg
      setTestMessages((prev) => [...prev, { role: "bot", content: "" }]);

      await sendChatMessageStream({
        tenantId,
        message: userMsg,
        conversationId: testConvId,
        endUser: { name: "Admin Test" },
        attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
        onToken: (token) => {
          setTestMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "bot") {
              updated[updated.length - 1] = { ...last, content: last.content + token };
            }
            return updated;
          });
        },
        onDone: (result) => {
          setTestConvId(result.conversation_id);
          if (result.tool_used) {
            setTestMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "bot") {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + `\n\n🔧 Tool: ${result.tool_used} (${result.tool_latency_ms}ms)`,
                };
              }
              return updated;
            });
          }
        },
        onError: (err) => {
          setTestMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "bot") {
              updated[updated.length - 1] = { ...last, content: `❌ Lỗi: ${err.message}` };
            }
            return updated;
          });
        },
      });
    } catch (err: any) {
      setTestMessages((prev) => [...prev, { role: "bot", content: `❌ Lỗi: ${err.message || "Unknown error"}` }]);
    } finally {
      setTestSending(false);
    }
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
    collectRole: ${widgetConfig.collectRole},
    roleOptions: ${JSON.stringify(widgetConfig.roleOptionsText.split(",").map((x) => x.trim()).filter(Boolean))},
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
          <Button variant="outline" size="sm" className="text-destructive gap-1.5" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5" />Xóa
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="overview" className="gap-2 text-xs"><Settings className="h-3.5 w-3.5" />Tổng quan</TabsTrigger>
            <TabsTrigger value="provider" className="gap-2 text-xs"><Brain className="h-3.5 w-3.5" />AI Provider</TabsTrigger>
            <TabsTrigger value="tools" className="gap-2 text-xs"><Sliders className="h-3.5 w-3.5" />Tools</TabsTrigger>
            <TabsTrigger value="knowledge" className="gap-2 text-xs"><FileText className="h-3.5 w-3.5" />Knowledge Base</TabsTrigger>
            <TabsTrigger value="widget" className="gap-2 text-xs"><Code2 className="h-3.5 w-3.5" />Widget & Embed</TabsTrigger>
            <TabsTrigger value="security" className="gap-2 text-xs"><Shield className="h-3.5 w-3.5" />Security</TabsTrigger>
            <TabsTrigger value="memory" className="gap-2 text-xs"><Brain className="h-3.5 w-3.5" />Memory & Skills</TabsTrigger>
            <TabsTrigger value="agent-core" className="gap-2 text-xs"><Rocket className="h-3.5 w-3.5" />Agent Core</TabsTrigger>
            <TabsTrigger value="test" className="gap-2 text-xs"><MessageSquare className="h-3.5 w-3.5" />Test Chat</TabsTrigger>
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
            <ToolManager tenantId={tenantId!} tenantName={tenant.name} />
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
                    {([
                      { key: "collectName" as const, label: "Họ tên" },
                      { key: "collectEmail" as const, label: "Email" },
                      { key: "collectPhone" as const, label: "SĐT" },
                      { key: "collectRole" as const, label: "Vai trò / vị trí" },
                    ]).map((f) => (
                      <div key={f.key} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                        <span className="text-sm">{f.label}</span>
                        <Switch checked={widgetConfig[f.key]} onCheckedChange={(v) => setWidgetConfig({ ...widgetConfig, [f.key]: v })} />
                      </div>
                    ))}
                    {widgetConfig.collectRole && (
                      <div className="space-y-2 rounded-lg border px-3 py-3">
                        <Label className="text-xs">Danh sách vai trò gợi ý (phân tách bằng dấu phẩy)</Label>
                        <Input
                          value={widgetConfig.roleOptionsText}
                          onChange={(e) => setWidgetConfig({ ...widgetConfig, roleOptionsText: e.target.value })}
                          className="h-9 text-xs"
                          placeholder="Người tạo đơn hàng, Kế toán, Quản lý"
                        />
                      </div>
                    )}
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

          {/* Memory & Skills */}
          <TabsContent value="memory" className="space-y-6">
            {tenantId && <BotMemoryPanel tenantId={tenantId} compact />}
          </TabsContent>

          {/* Agent Core */}
          <TabsContent value="agent-core" className="space-y-6">
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
                  <Button size="sm" className="gap-2 glow-primary" onClick={saveAgentCoreConfig} disabled={saving}>
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

                <Textarea
                  value={bootstrapBody}
                  onChange={(e) => setBootstrapBody(e.target.value)}
                  rows={16}
                  className="font-mono text-xs"
                />

                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => runBootstrapAction("validate")}
                    disabled={bootstrapLoading !== null}
                  >
                    {bootstrapLoading === "validate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Validate
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2 glow-primary"
                    onClick={() => runBootstrapAction("bootstrap")}
                    disabled={bootstrapLoading !== null}
                  >
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
                  <Button variant="ghost" size="sm" className="text-xs" onClick={loadRuntimeSnapshot} disabled={runtimeLoading}>
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
          </TabsContent>

          {/* Test Chat */}
          <TabsContent value="test" className="space-y-6">
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="flex items-center gap-3 border-b px-6 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><MessageSquare className="h-5 w-5 text-primary" /></div>
                <div>
                  <h3 className="text-sm font-semibold">Test Conversation — {tenant.name}</h3>
                  <p className="text-xs text-muted-foreground">Gửi tin nhắn thử để test AI bot response</p>
                </div>
                {testConvId && (
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">conv: {testConvId.slice(0, 8)}...</span>
                )}
                <Button variant="outline" size="sm" className="text-xs" onClick={() => { setTestMessages([]); setTestConvId(undefined); }}>
                  Reset
                </Button>
              </div>
              <div className="h-80 overflow-y-auto p-6 space-y-4">
                {testMessages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-12">
                    Gửi tin nhắn đầu tiên để bắt đầu test
                  </div>
                )}
                {testMessages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role !== "user" && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-1">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-bot"}>
                      {msg.imageUrls?.map((url, j) => (
                        <img key={j} src={url} alt="" className="rounded-lg max-w-full max-h-32 mb-2 border" />
                      ))}
                      <ChatMessageRenderer content={msg.content} role={msg.role === "bot" ? "bot" : "user"} />
                    </div>
                    {msg.role === "user" && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary mt-1">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                {testSending && (
                  <div className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-1">
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    </div>
                    <div className="chat-bubble-bot">
                      <p className="text-sm text-muted-foreground">Đang trả lời...</p>
                    </div>
                  </div>
                )}
                <div ref={testEndRef} />
              </div>
              <div className="border-t p-4">
                {testAttachments.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-3">
                    {testAttachments.map((att, i) => (
                      <div key={i} className="relative group">
                        {att.type === "image" && att.preview ? (
                          <img src={att.preview} alt="" className="h-12 w-12 rounded-lg object-cover border" />
                        ) : (
                          <div className="h-12 rounded-lg border bg-muted/50 flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground max-w-[120px]">
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="truncate">{att.file.name}</span>
                          </div>
                        )}
                        <button onClick={() => setTestAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <ChatFileUpload
                    attachments={[]}
                    onAdd={(a) => setTestAttachments((prev) => [...prev, a])}
                    onRemove={() => {}}
                    disabled={testSending}
                  />
                  <Input
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendTestMessage()}
                    placeholder="Nhập tin nhắn test..."
                    className="flex-1 h-10"
                    disabled={testSending}
                  />
                  <Button size="icon" className="shrink-0 h-9 w-9 glow-primary" onClick={sendTestMessage} disabled={testSending || (!testInput.trim() && testAttachments.length === 0)}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Tenant Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa tenant "{tenant.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể hoàn tác. Tất cả conversations, KB documents, configs sẽ bị xóa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTenant} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteTenantMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Xóa tenant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default TenantDetail;
