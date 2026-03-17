import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { fetchProviderModels, sendChatMessage, sendChatMessageStream, uploadChatAttachment, extractFileContent, type ModelInfo } from "@/lib/api";
import { assertEdgeFunctionSuccess, getEdgeFunctionErrorMessage } from "@/lib/edge-functions";
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
import { ChatMessageRenderer } from "@/components/chat/ChatMessageRenderer";
import { ChatFileUpload, type ChatAttachment } from "@/components/chat/ChatFileUpload";
import { AgentDetailHeader } from "@/components/agent-detail/AgentDetailHeader";
import { AgentOverviewTab } from "@/components/agent-detail/AgentOverviewTab";
import { AgentCoreTab } from "@/components/agent-detail/AgentCoreTab";
import { AgentChannelsTab } from "@/components/agent-detail/AgentChannelsTab";
import { AgentRuntimeTab } from "@/components/agent-detail/AgentRuntimeTab";
import { AgentTestConsoleTab } from "@/components/agent-detail/AgentTestConsoleTab";
import { AgentMemoryTab } from "@/components/agent-detail/AgentMemoryTab";
import { AgentSkillsTab } from "@/components/agent-detail/AgentSkillsTab";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  ArrowLeft, Brain, Code2, Copy, Check, FileText, Globe, Key,
  Palette, Plus, Save, Settings, Shield, Sliders, TestTube,
  Trash2, User, Loader2, CheckCircle2, Send, Bot, MessageSquare,
  Rocket, ServerCog, Workflow,
} from "lucide-react";

// ==================== FLOW SUMMARY ====================
function FlowSummary({ tenantId, onOpen, onOpenFlow }: { tenantId: string; onOpen: () => void; onOpenFlow: (flowId: string) => void }) {
  const { data: flows, isLoading, refetch } = useQuery({
    queryKey: ["flow_definitions_summary", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flow_definitions")
        .select("id, name, is_active, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDesc, setNewFlowDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newFlowName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("flow_definitions")
        .insert({
          tenant_id: tenantId,
          name: newFlowName.trim(),
          description: newFlowDesc.trim() || null,
          is_active: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Đã tạo flow. Đang mở Flow Builder...");
      setShowCreate(false);
      setNewFlowName("");
      setNewFlowDesc("");
      await refetch();
      onOpenFlow(data.id);
    } catch (err: any) {
      toast.error(err.message || "Tạo flow thất bại");
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground text-center py-6">Đang tải flows...</p>;

  return (
    <div className="space-y-3">
      {!flows?.length ? (
        <div className="text-center py-8 space-y-3">
          <Workflow className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Chưa có flow nào. Tạo flow đầu tiên để thiết kế hội thoại tự động.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {flows.map((flow: any) => (
            <div key={flow.id} className="flex items-center justify-between border rounded-lg px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onOpenFlow(flow.id)}>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Workflow className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{flow.name}</p>
                  <p className="text-[11px] text-muted-foreground">{format(new Date(flow.created_at), "dd/MM/yyyy")}</p>
                </div>
              </div>
              <span className={flow.is_active ? "badge-active" : "badge-pending"}>{flow.is_active ? "active" : "draft"}</span>
            </div>
          ))}
          <button onClick={onOpen} className="w-full text-xs text-primary hover:underline text-center pt-1">Mở Flow Builder →</button>
        </div>
      )}

      {showCreate ? (
        <div className="rounded-lg border bg-card p-4 space-y-3 animate-fade-in">
          <p className="text-sm font-medium">Tạo flow mới</p>
          <div className="space-y-2">
            <Label className="text-xs">Tên flow *</Label>
            <Input
              value={newFlowName}
              onChange={(e) => setNewFlowName(e.target.value)}
              placeholder="VD: Hỗ trợ đặt hàng, Chào mừng khách hàng..."
              className="h-9"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Mô tả (tuỳ chọn)</Label>
            <Input
              value={newFlowDesc}
              onChange={(e) => setNewFlowDesc(e.target.value)}
              placeholder="Mô tả ngắn về mục đích flow..."
              className="h-9"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewFlowName(""); setNewFlowDesc(""); }}>Huỷ</Button>
            <Button size="sm" className="gap-2 glow-primary" onClick={handleCreate} disabled={creating || !newFlowName.trim()}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Workflow className="h-3.5 w-3.5" />}
              Tạo & Mở Builder
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="gap-2 w-full" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" />Tạo flow mới
        </Button>
      )}
    </div>
  );
}

const TenantDetail = () => {
  const { tenantId, workspaceId, agentId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const resolvedTenantId = tenantId || workspaceId || "";
  const isAgentBridge = !!workspaceId && !!agentId;
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview");

  // Resolved default-agent UUID (fetched once on mount)
  const [resolvedAgentId, setResolvedAgentId] = useState<string | undefined>(undefined);

  // Unsaved-changes tracking: set of tab keys with uncommitted edits
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(new Set());
  const markDirty = (tab: string) => setDirtyTabs((prev) => new Set([...prev, tab]));
  const clearDirty = (tab: string) => setDirtyTabs((prev) => { const s = new Set(prev); s.delete(tab); return s; });

  const { data: tenant, isLoading: loadingTenant } = useTenant(resolvedTenantId);
  const { data: config, isLoading: loadingConfig } = useTenantConfig(resolvedTenantId);
  const { data: kbDocs } = useKbDocuments(resolvedTenantId);
  const { data: toolDefs } = useToolDefinitions(resolvedTenantId);
  const { data: conversations } = useConversations(resolvedTenantId);
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

  // Resolve default agent ID for this tenant (used in chat + channel bindings)
  useEffect(() => {
    if (!resolvedTenantId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("agents" as any)
          .select("id")
          .eq("tenant_id", resolvedTenantId)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle();
        if (data?.id) setResolvedAgentId(data.id);
      } catch { /* agent table may not exist yet; ignore */ }
    })();
  }, [resolvedTenantId]);

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
    if (!resolvedTenantId) return;
    setBootstrapBody(JSON.stringify({
      tenant_id: resolvedTenantId,
      mode: "bootstrap",
      rollback_on_error: true,
      memory: {
        enable_v2: agentCore.memoryV2Enabled,
        decay_days: agentCore.memoryDecayDays,
        min_confidence: agentCore.memoryMinConfidence,
      },
      skills: {
        enable_runtime: agentCore.skillsRuntimeEnabled,
        packs: [],
      },
      mcp: {
        enable_gateway: agentCore.mcpGatewayEnabled,
        servers: [],
      },
      governance: {
        confidence_threshold: security.confidenceThreshold,
        max_tool_retries: security.maxToolRetries,
        prompt_injection_defense: security.promptInjectionDefense,
        pii_masking: security.piiMasking,
      },
    }, null, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTenantId, agentCore, security]);

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
    if (!resolvedTenantId) return;
    setSaving(true);
    try {
      await updateConfig.mutateAsync({
        tenantId: resolvedTenantId,
        config: {
          provider_endpoint: provider.endpoint,
          provider_api_key: provider.apiKey,
          provider_model: provider.model,
          temperature: parseFloat(provider.temperature) || 0.3,
          max_tokens: parseInt(provider.maxTokens) || 2048,
          system_prompt: systemPrompt,
        },
      });
      clearDirty("provider");
      clearDirty("overview");
      toast.success("Đã lưu cấu hình AI Provider");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const saveWidgetConfig = async () => {
    if (!resolvedTenantId) return;
    setSaving(true);
    try {
      await updateConfig.mutateAsync({
        tenantId: resolvedTenantId,
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
      clearDirty("widget");
      toast.success("Đã lưu widget config");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const saveSecurityConfig = async () => {
    if (!resolvedTenantId) return;
    setSaving(true);
    try {
      await updateConfig.mutateAsync({
        tenantId: resolvedTenantId,
        config: {
          confidence_threshold: security.confidenceThreshold,
          max_tool_retries: security.maxToolRetries,
          pii_masking: security.piiMasking,
          prompt_injection_defense: security.promptInjectionDefense,
        },
      });
      clearDirty("security");
      toast.success("Đã lưu security config");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const saveTenantInfo = async () => {
    if (!resolvedTenantId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("tenants").update({ name: tenantName, domain: tenantDomain || null }).eq("id", resolvedTenantId);
      if (error) throw error;
      clearDirty("overview");
      toast.success("Đã lưu thông tin tenant");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const saveAgentCoreConfig = async () => {
    if (!resolvedTenantId) return;
    setSaving(true);
    try {
      await updateConfig.mutateAsync({
        tenantId: resolvedTenantId,
        config: {
          memory_v2_enabled: agentCore.memoryV2Enabled,
          skills_runtime_enabled: agentCore.skillsRuntimeEnabled,
          mcp_gateway_enabled: agentCore.mcpGatewayEnabled,
          memory_decay_days: agentCore.memoryDecayDays,
          memory_min_confidence: agentCore.memoryMinConfidence,
        } as any,
      });
      clearDirty("agent-core");
      toast.success("Đã lưu cấu hình Agent Core");
    } catch (err: any) {
      toast.error(err.message || "Lưu Agent Core thất bại");
    } finally {
      setSaving(false);
    }
  };

  const runBootstrapAction = async (action: "validate" | "bootstrap") => {
    if (!resolvedTenantId) return;
    setBootstrapLoading(action);
    try {
      const parsed = JSON.parse(bootstrapBody || "{}");
      parsed.tenant_id = resolvedTenantId;

      const functionName = action === "validate" ? "bootstrap-validate" : "bootstrap";
      if (action === "bootstrap") {
        parsed.mode = "bootstrap";
      }

      const result = await supabase.functions.invoke(functionName, { body: parsed });
      const data = await assertEdgeFunctionSuccess(result);

      setBootstrapResult(data);
      toast.success(action === "validate" ? "Validate thành công" : "Bootstrap hoàn tất");
      await loadRuntimeSnapshot();
    } catch (err: any) {
      const message = err instanceof Error ? err.message : await getEdgeFunctionErrorMessage(err);
      toast.error(message || `Lỗi ${action}`);
      setBootstrapResult({ ok: false, error: message || "Unknown error" });
    } finally {
      setBootstrapLoading(null);
    }
  };

  const loadRuntimeSnapshot = async () => {
    if (!resolvedTenantId) return;
    setRuntimeLoading(true);
    try {
      const [{ data: skillsData }, { data: mcpData }, { data: runsData }] = await Promise.all([
        supabase.functions.invoke("skills", {
          body: { action: "list_tenant", tenant_id: resolvedTenantId },
        }),
        supabase.functions.invoke("mcp-gateway", {
          body: { action: "state", tenant_id: resolvedTenantId },
        }),
        supabase
          .from("tenant_bootstrap_runs" as any)
          .select("id, mode, status, started_at, finished_at, error_message")
          .eq("tenant_id", resolvedTenantId)
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
    if (activeTab === "agent-core" && resolvedTenantId) {
      loadRuntimeSnapshot();
    }
  }, [activeTab, resolvedTenantId]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams, activeTab]);

  const handleDeleteTenant = async () => {
    if (!resolvedTenantId) return;
    try {
      await deleteTenantMut.mutateAsync(resolvedTenantId);
      toast.success("Đã xóa tenant");
      navigate("/tenants");
    } catch (err: any) {
      toast.error(err.message || "Xóa thất bại");
    }
  };


  // Test chat
  const sendTestMessage = async () => {
    if ((!testInput.trim() && testAttachments.length === 0) || !resolvedTenantId) return;
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
            const url = await uploadChatAttachment(att.file, resolvedTenantId);
            uploadedUrls.push(url);
          } catch (err) {
            console.error("Upload failed:", err);
            toast.error(`Upload thất bại: ${att.file.name}`);
          }
        }
        if (uploadedUrls.length > 0) {
          try {
            const extracted = await extractFileContent(uploadedUrls, resolvedTenantId);
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
        tenantId: resolvedTenantId,
        agentId: resolvedAgentId,
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
        <AgentDetailHeader
          tenant={tenant}
          isAgentBridge={isAgentBridge}
          agentId={agentId}
          resolvedTenantId={resolvedTenantId}
          onBack={() => navigate(isAgentBridge ? `/workspaces/${resolvedTenantId}/agents` : "/tenants")}
          onDelete={() => setShowDeleteConfirm(true)}
        />

        <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", value); return next; }); }} className="space-y-6">
          <TabsList className="bg-muted/50 flex-wrap h-auto">
            {([
              { value: "overview", icon: Settings, label: "Overview" },
              { value: "provider", icon: Brain, label: "Core" },
              { value: "tools", icon: Sliders, label: "Integrations" },
              { value: "knowledge", icon: FileText, label: "Knowledge" },
              { value: "widget", icon: Code2, label: "Channels" },
              { value: "security", icon: Shield, label: "Safety" },
              { value: "memory", icon: Brain, label: "Memory" },
              { value: "skills", icon: Sliders, label: "Skills" },
              { value: "agent-core", icon: Rocket, label: "Runtime" },
              { value: "flows", icon: Workflow, label: "Flows" },
              { value: "test", icon: MessageSquare, label: "Test" },
            ] as const).map(({ value, icon: Icon, label }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5 text-xs relative">
                <Icon className="h-3.5 w-3.5" />
                {label}
                {dirtyTabs.has(value) && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400" title="Có thay đổi chưa lưu" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview">
            <AgentOverviewTab
              tenant={tenant}
              conversationsCount={conversations?.length || 0}
              kbCount={kbDocs?.length || 0}
              toolCount={toolDefs?.length || 0}
              tenantName={tenantName}
              tenantDomain={tenantDomain}
              systemPrompt={systemPrompt}
              saving={saving}
              setTenantName={(v) => { setTenantName(v); markDirty("overview"); }}
              setTenantDomain={(v) => { setTenantDomain(v); markDirty("overview"); }}
              setSystemPrompt={(v) => { setSystemPrompt(v); markDirty("overview"); markDirty("provider"); }}
              onSaveTenantInfo={saveTenantInfo}
              onSaveProviderConfig={saveProviderConfig}
            />
          </TabsContent>

          <TabsContent value="provider">
            <AgentCoreTab
              tenantName={tenant.name}
              provider={provider}
              setProvider={(v) => { setProvider(v); markDirty("provider"); }}
              connectionOk={connectionOk}
              loadingModels={loadingModels}
              models={models}
              searchModel={searchModel}
              setSearchModel={setSearchModel}
              saving={saving}
              onFetchModels={fetchModels}
              onSave={saveProviderConfig}
            />
          </TabsContent>

          {/* Tools */}
          <TabsContent value="tools" className="space-y-6">
            <ToolManager tenantId={resolvedTenantId} tenantName={tenant.name} />
          </TabsContent>

          {/* Knowledge Base */}
          <TabsContent value="knowledge" className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Knowledge Base — {tenant.name}</h3>
              <Button size="sm" className="gap-2 glow-primary" onClick={() => navigate(`/knowledge?tenant=${resolvedTenantId}`)}>
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

          <TabsContent value="widget">
            <AgentChannelsTab
              tenantId={resolvedTenantId}
              tenantName={tenant.name}
              widgetConfig={widgetConfig}
              setWidgetConfig={(v) => { setWidgetConfig(v); markDirty("widget"); }}
              copied={copied}
              embedCode={embedCode}
              saving={saving}
              onCopy={handleCopy}
              onSave={saveWidgetConfig}
            />
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
                  <Input type="number" step="0.05" min="0" max="1" value={security.confidenceThreshold} onChange={(e) => { setSecurity({ ...security, confidenceThreshold: parseFloat(e.target.value) || 0.6 }); markDirty("security"); }} className="font-mono text-sm h-10 max-w-xs" />
                  <p className="text-[11px] text-muted-foreground">Handoff khi confidence dưới ngưỡng</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Max Tool Retries</Label>
                  <Input type="number" min="0" max="5" value={security.maxToolRetries} onChange={(e) => { setSecurity({ ...security, maxToolRetries: parseInt(e.target.value) || 2 }); markDirty("security"); }} className="font-mono text-sm h-10 max-w-xs" />
                </div>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div><p className="text-sm font-medium">PII Masking</p><p className="text-xs text-muted-foreground">Ẩn thông tin nhạy cảm</p></div>
                  <Switch checked={security.piiMasking} onCheckedChange={(v) => { setSecurity({ ...security, piiMasking: v }); markDirty("security"); }} />
                </div>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div><p className="text-sm font-medium">Prompt Injection Defense</p></div>
                  <Switch checked={security.promptInjectionDefense} onCheckedChange={(v) => { setSecurity({ ...security, promptInjectionDefense: v }); markDirty("security"); }} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="gap-2 glow-primary" onClick={saveSecurityConfig} disabled={saving}>
                  <Save className="h-3.5 w-3.5" />Lưu
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="memory">
            {resolvedTenantId && <AgentMemoryTab tenantId={resolvedTenantId} />}
          </TabsContent>

          <TabsContent value="skills">
            {resolvedTenantId && <AgentSkillsTab tenantId={resolvedTenantId} />}
          </TabsContent>

          {/* Flows */}
          <TabsContent value="flows" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Conversation Flows — {tenant.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Thiết kế luồng hội thoại có điều kiện, phân nhánh và tự động chuyển nhân viên.</p>
              </div>
              <Button size="sm" className="gap-2 glow-primary" onClick={() => navigate(`/flows?tenant=${resolvedTenantId}`)}>
                <Workflow className="h-3.5 w-3.5" />Mở Flow Builder
              </Button>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <FlowSummary
                tenantId={resolvedTenantId}
                onOpen={() => navigate(`/flows?tenant=${resolvedTenantId}`)}
                onOpenFlow={(flowId) => navigate(`/flows?tenant=${resolvedTenantId}&flow=${flowId}`)}
              />
            </div>
          </TabsContent>

          <TabsContent value="agent-core">
            <AgentRuntimeTab
              agentCore={agentCore}
              setAgentCore={(v) => { setAgentCore(v); markDirty("agent-core"); }}
              saving={saving}
              bootstrapBody={bootstrapBody}
              setBootstrapBody={setBootstrapBody}
              bootstrapLoading={bootstrapLoading}
              bootstrapResult={bootstrapResult}
              runtimeSnapshot={runtimeSnapshot}
              runtimeLoading={runtimeLoading}
              onSaveAgentCore={saveAgentCoreConfig}
              onRunBootstrapAction={runBootstrapAction}
              onRefreshSnapshot={loadRuntimeSnapshot}
            />
          </TabsContent>

          <TabsContent value="test">
            <AgentTestConsoleTab
              tenantName={tenant.name}
              testConvId={testConvId}
              testMessages={testMessages}
              testSending={testSending}
              testEndRef={testEndRef}
              testAttachments={testAttachments}
              setTestAttachments={setTestAttachments}
              testInput={testInput}
              setTestInput={setTestInput}
              onSend={sendTestMessage}
              onReset={() => { setTestMessages([]); setTestConvId(undefined); }}
            />
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
