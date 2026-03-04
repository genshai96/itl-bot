import { useState } from "react";
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
import {
  ArrowLeft,
  Brain,
  Code2,
  Copy,
  Check,
  FileText,
  Globe,
  Key,
  MessageSquare,
  Palette,
  RefreshCw,
  Save,
  Settings,
  Shield,
  Sliders,
  TestTube,
  Upload,
  Trash2,
  Eye,
  CheckCircle2,
  User,
} from "lucide-react";

const TenantDetail = () => {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Mock tenant data
  const tenant = {
    id: tenantId || "t-001",
    name: "Acme Corp",
    slug: "acme-corp",
    status: "active",
    domain: "acme.com",
    createdAt: "2026-01-15",
  };

  // Provider config state
  const [provider, setProvider] = useState({
    endpoint: "https://openrouter.ai/api/v1",
    apiKey: "sk-or-v1-xxxx...xxxx",
    model: "gpt-4o",
    temperature: "0.3",
    maxTokens: "2048",
  });

  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [connectionOk, setConnectionOk] = useState(false);

  // Widget config state
  const [widgetConfig, setWidgetConfig] = useState({
    primaryColor: "#0d9488",
    position: "bottom-right" as "bottom-right" | "bottom-left",
    title: "Hỗ trợ Acme Corp",
    subtitle: "Chúng tôi sẵn sàng giúp bạn",
    placeholder: "Nhập câu hỏi của bạn...",
    welcomeMessage: "Xin chào! 👋 Tôi có thể giúp gì cho bạn?",
    collectName: true,
    collectEmail: true,
    collectPhone: false,
    showPoweredBy: true,
    autoOpen: false,
    autoOpenDelay: 5,
  });

  // Tools
  const [tools, setTools] = useState([
    { id: "check_receivable_by_month", name: "Tra công nợ theo tháng", enabled: true, endpoint: "/v1/tools/receivable/by-month" },
    { id: "check_receivable_by_sales", name: "Tra công nợ theo sales", enabled: true, endpoint: "/v1/tools/receivable/by-sales" },
    { id: "check_contract_status", name: "Trạng thái hợp đồng", enabled: false, endpoint: "/v1/tools/contracts/status" },
  ]);

  // KB documents
  const documents = [
    { id: 1, name: "Hướng dẫn sử dụng module Kế toán", chunks: 42, status: "indexed", updatedAt: "2026-03-01" },
    { id: 2, name: "FAQ Công nợ & Thanh toán", chunks: 18, status: "indexed", updatedAt: "2026-02-28" },
    { id: 3, name: "Quy trình báo lỗi kỹ thuật", chunks: 25, status: "processing", updatedAt: "2026-03-04" },
  ];

  const fetchModels = () => {
    setLoadingModels(true);
    setTimeout(() => {
      setModels(["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo", "claude-3.5-sonnet", "gemini-2.5-flash"]);
      setConnectionOk(true);
      setLoadingModels(false);
    }, 1200);
  };

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
    // Optional: pre-fill end user info
    // user: { name: "John", email: "john@acme.com", phone: "+84..." }
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
              AC
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{tenant.name}</h1>
              <p className="text-xs text-muted-foreground font-mono">{tenant.slug} · {tenant.domain}</p>
            </div>
          </div>
          <span className="badge-active">Active</span>
        </div>

        {/* Tabs */}
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
                <p className="text-3xl font-bold mt-1">1,284</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-muted-foreground">KB Documents</p>
                <p className="text-3xl font-bold mt-1">4</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-muted-foreground">Deflection Rate</p>
                <p className="text-3xl font-bold mt-1">47%</p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <h3 className="text-sm font-semibold">Thông tin Tenant</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Tên</Label>
                  <Input defaultValue={tenant.name} className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Domain</Label>
                  <Input defaultValue={tenant.domain} className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Slug</Label>
                  <Input defaultValue={tenant.slug} className="h-10 font-mono text-sm" readOnly />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Ngày tạo</Label>
                  <Input defaultValue={tenant.createdAt} className="h-10" readOnly />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="gap-2 glow-primary"><Save className="h-3.5 w-3.5" />Lưu</Button>
              </div>
            </div>
          </TabsContent>

          {/* AI Provider */}
          <TabsContent value="provider" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">API Configuration cho {tenant.name}</h3>
                  <p className="text-xs text-muted-foreground">OpenAI-compatible endpoint (OpenRouter, Groq, vLLM, etc.)</p>
                </div>
                {connectionOk && (
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-success font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />Connected
                  </span>
                )}
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
                  <Button onClick={fetchModels} variant="outline" size="sm" className="gap-2 text-xs">
                    <TestTube className="h-3.5 w-3.5" />Test & Fetch Models
                  </Button>
                </div>
                {models.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Model</Label>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {models.map((model) => (
                        <button key={model} onClick={() => setProvider({ ...provider, model })}
                          className={`rounded-lg border px-4 py-2.5 text-left text-sm font-mono transition-all ${provider.model === model ? "border-primary bg-primary/5 text-primary" : "hover:border-primary/30 hover:bg-muted/50"}`}>
                          {model}
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
              <div className="flex justify-end"><Button size="sm" className="gap-2 glow-primary"><Save className="h-3.5 w-3.5" />Lưu cấu hình</Button></div>
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
                <Button variant="outline" size="sm" className="gap-2 text-xs">+ Thêm tool</Button>
              </div>
              <div className="space-y-3">
                {tools.map((tool) => (
                  <div key={tool.id} className="flex items-center justify-between rounded-lg border px-4 py-3.5 hover:bg-muted/30 transition-colors">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{tool.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{tool.endpoint}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={tool.enabled} onCheckedChange={(checked) => setTools(tools.map((t) => t.id === tool.id ? { ...t, enabled: checked } : t))} />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
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
              <Button size="sm" className="gap-2 glow-primary"><Upload className="h-3.5 w-3.5" />Upload tài liệu</Button>
            </div>
            <div className="rounded-lg border bg-card">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between border-b last:border-0 px-6 py-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><FileText className="h-4 w-4 text-primary" /></div>
                    <div>
                      <p className="text-sm font-medium">{doc.name}</p>
                      <p className="text-[11px] text-muted-foreground">{doc.chunks} chunks · {doc.updatedAt}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={doc.status === "indexed" ? "badge-active" : "badge-pending"}>{doc.status === "indexed" ? "Indexed" : "Processing"}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Widget & Embed */}
          <TabsContent value="widget" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Widget Customization */}
              <div className="rounded-lg border bg-card p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Palette className="h-5 w-5 text-primary" /></div>
                  <div>
                    <h3 className="text-sm font-semibold">Tùy chỉnh Widget</h3>
                    <p className="text-xs text-muted-foreground">Giao diện chat popup trên website</p>
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

                  <div className="space-y-2">
                    <Label className="text-xs">Tiêu đề</Label>
                    <Input value={widgetConfig.title} onChange={(e) => setWidgetConfig({ ...widgetConfig, title: e.target.value })} className="h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Phụ đề</Label>
                    <Input value={widgetConfig.subtitle} onChange={(e) => setWidgetConfig({ ...widgetConfig, subtitle: e.target.value })} className="h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Tin nhắn chào mừng</Label>
                    <Textarea value={widgetConfig.welcomeMessage} onChange={(e) => setWidgetConfig({ ...widgetConfig, welcomeMessage: e.target.value })} rows={2} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Placeholder input</Label>
                    <Input value={widgetConfig.placeholder} onChange={(e) => setWidgetConfig({ ...widgetConfig, placeholder: e.target.value })} className="h-10" />
                  </div>

                  {/* End User Info Collection */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      <Label className="text-xs font-semibold">Thu thập thông tin End User</Label>
                    </div>
                    <div className="space-y-2">
                      {[
                        { key: "collectName" as const, label: "Họ tên" },
                        { key: "collectEmail" as const, label: "Email" },
                        { key: "collectPhone" as const, label: "Số điện thoại" },
                      ].map((field) => (
                        <div key={field.key} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                          <span className="text-sm">{field.label}</span>
                          <Switch checked={widgetConfig[field.key]} onCheckedChange={(v) => setWidgetConfig({ ...widgetConfig, [field.key]: v })} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Extra options */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                      <div>
                        <span className="text-sm">Tự động mở popup</span>
                        <p className="text-[11px] text-muted-foreground">Sau {widgetConfig.autoOpenDelay}s khi user vào trang</p>
                      </div>
                      <Switch checked={widgetConfig.autoOpen} onCheckedChange={(v) => setWidgetConfig({ ...widgetConfig, autoOpen: v })} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                      <span className="text-sm">Hiện "Powered by"</span>
                      <Switch checked={widgetConfig.showPoweredBy} onCheckedChange={(v) => setWidgetConfig({ ...widgetConfig, showPoweredBy: v })} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Embed Code + Preview */}
              <div className="space-y-6">
                {/* Embed Code */}
                <div className="rounded-lg border bg-card p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Code2 className="h-5 w-5 text-primary" /></div>
                      <div>
                        <h3 className="text-sm font-semibold">Embed Code</h3>
                        <p className="text-xs text-muted-foreground">Copy & paste vào website của tenant</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleCopy}>
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Đã copy!" : "Copy"}
                    </Button>
                  </div>
                  <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto leading-relaxed max-h-64 overflow-y-auto">
                    <code>{embedCode}</code>
                  </pre>
                </div>

                {/* Live Preview */}
                <div className="rounded-lg border bg-card p-6 space-y-4">
                  <h3 className="text-sm font-semibold">Preview Widget</h3>
                  <div className="relative bg-muted/50 rounded-lg h-96 flex items-end p-4" style={{ justifyContent: widgetConfig.position === "bottom-right" ? "flex-end" : "flex-start" }}>
                    {/* Mini chat preview */}
                    <div className="w-80 rounded-2xl shadow-lg overflow-hidden border" style={{ boxShadow: `0 8px 30px ${widgetConfig.primaryColor}20` }}>
                      {/* Header */}
                      <div className="px-5 py-4" style={{ background: widgetConfig.primaryColor }}>
                        <h4 className="text-sm font-semibold" style={{ color: "white" }}>{widgetConfig.title}</h4>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.8)" }}>{widgetConfig.subtitle}</p>
                      </div>
                      {/* Messages */}
                      <div className="bg-card p-4 space-y-3 h-48">
                        <div className="chat-bubble-bot text-xs">{widgetConfig.welcomeMessage}</div>
                        <div className="chat-bubble-user text-xs ml-auto" style={{ background: widgetConfig.primaryColor }}>
                          Tra công nợ tháng 2
                        </div>
                      </div>
                      {/* Input */}
                      <div className="border-t px-4 py-3 bg-card">
                        <div className="flex items-center gap-2 rounded-full border px-4 py-2 text-xs text-muted-foreground">
                          {widgetConfig.placeholder}
                        </div>
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
                <div>
                  <h3 className="text-sm font-semibold">Security — {tenant.name}</h3>
                  <p className="text-xs text-muted-foreground">Guardrails và policy cho tenant này</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Confidence Threshold</Label>
                  <Input type="number" step="0.05" min="0" max="1" defaultValue="0.6" className="font-mono text-sm h-10 max-w-xs" />
                  <p className="text-[11px] text-muted-foreground">Handoff khi confidence dưới ngưỡng</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Max Tool Retries</Label>
                  <Input type="number" min="0" max="5" defaultValue="2" className="font-mono text-sm h-10 max-w-xs" />
                </div>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div><p className="text-sm font-medium">PII Masking</p><p className="text-xs text-muted-foreground">Ẩn thông tin nhạy cảm</p></div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div><p className="text-sm font-medium">Prompt Injection Defense</p></div>
                  <Switch defaultChecked />
                </div>
              </div>
              <div className="flex justify-end"><Button size="sm" className="gap-2 glow-primary"><Save className="h-3.5 w-3.5" />Lưu</Button></div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default TenantDetail;
