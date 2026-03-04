import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Brain,
  Key,
  Globe,
  Shield,
  Sliders,
  Save,
  TestTube,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Plus,
} from "lucide-react";

const Settings = () => {
  const [providerConfig, setProviderConfig] = useState({
    endpoint: "https://api.openai.com/v1",
    apiKey: "",
    model: "",
    temperature: "0.3",
    maxTokens: "2048",
  });
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");

  const [tools, setTools] = useState([
    { id: "check_receivable_by_month", name: "Tra công nợ theo tháng", enabled: true, endpoint: "/v1/tools/receivable/by-month" },
    { id: "check_receivable_by_sales", name: "Tra công nợ theo sales", enabled: true, endpoint: "/v1/tools/receivable/by-sales" },
    { id: "check_contract_status", name: "Trạng thái hợp đồng", enabled: false, endpoint: "/v1/tools/contracts/status" },
  ]);

  const fetchModels = async () => {
    setLoadingModels(true);
    // Simulate fetching models
    setTimeout(() => {
      setModels(["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo", "gpt-4-turbo"]);
      setConnectionStatus("success");
      setLoadingModels(false);
    }, 1500);
  };

  const testConnection = () => {
    setConnectionStatus("idle");
    fetchModels();
  };

  return (
    <AdminLayout>
      <div className="max-w-4xl space-y-8 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Cấu hình tenant, AI provider, tool calling</p>
        </div>

        <Tabs defaultValue="provider" className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="provider" className="gap-2 text-xs">
              <Brain className="h-3.5 w-3.5" />
              AI Provider
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-2 text-xs">
              <Sliders className="h-3.5 w-3.5" />
              Tool Calling
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2 text-xs">
              <Shield className="h-3.5 w-3.5" />
              Security
            </TabsTrigger>
          </TabsList>

          {/* AI Provider Config */}
          <TabsContent value="provider" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">API Configuration</h3>
                  <p className="text-xs text-muted-foreground">Cấu hình endpoint, API key và model cho tenant</p>
                </div>
                {connectionStatus === "success" && (
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-success font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected
                  </span>
                )}
              </div>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">API Endpoint</Label>
                  <Input
                    value={providerConfig.endpoint}
                    onChange={(e) => setProviderConfig({ ...providerConfig, endpoint: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className="font-mono text-sm h-10"
                  />
                  <p className="text-[11px] text-muted-foreground">Hỗ trợ OpenAI-compatible endpoints (OpenRouter, Groq, vLLM, etc.)</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-2">
                    <Key className="h-3.5 w-3.5" />
                    API Key
                  </Label>
                  <Input
                    type="password"
                    value={providerConfig.apiKey}
                    onChange={(e) => setProviderConfig({ ...providerConfig, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="font-mono text-sm h-10"
                  />
                </div>

                <div className="flex gap-3">
                  <Button onClick={testConnection} variant="outline" size="sm" className="gap-2 text-xs">
                    <TestTube className="h-3.5 w-3.5" />
                    Test Connection
                  </Button>
                  <Button onClick={fetchModels} variant="outline" size="sm" className="gap-2 text-xs" disabled={loadingModels}>
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingModels ? "animate-spin" : ""}`} />
                    Fetch Models
                  </Button>
                </div>

                {models.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Model</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {models.map((model) => (
                        <button
                          key={model}
                          onClick={() => setProviderConfig({ ...providerConfig, model })}
                          className={`rounded-lg border px-4 py-2.5 text-left text-sm font-mono transition-all ${
                            providerConfig.model === model
                              ? "border-primary bg-primary/5 text-primary"
                              : "hover:border-primary/30 hover:bg-muted/50"
                          }`}
                        >
                          {model}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Temperature</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={providerConfig.temperature}
                      onChange={(e) => setProviderConfig({ ...providerConfig, temperature: e.target.value })}
                      className="font-mono text-sm h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Max Tokens</Label>
                    <Input
                      type="number"
                      value={providerConfig.maxTokens}
                      onChange={(e) => setProviderConfig({ ...providerConfig, maxTokens: e.target.value })}
                      className="font-mono text-sm h-10"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" className="gap-2 glow-primary">
                  <Save className="h-3.5 w-3.5" />
                  Lưu cấu hình
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Tool Calling */}
          <TabsContent value="tools" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Sliders className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Tool Allowlist</h3>
                    <p className="text-xs text-muted-foreground">Quản lý các tool bot được phép gọi</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="gap-2 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Thêm tool
                </Button>
              </div>

              <div className="space-y-3">
                {tools.map((tool) => (
                  <div key={tool.id} className="flex items-center justify-between rounded-lg border px-4 py-3.5 hover:bg-muted/30 transition-colors">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{tool.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{tool.endpoint}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={tool.enabled}
                        onCheckedChange={(checked) => {
                          setTools(tools.map((t) => t.id === tool.id ? { ...t, enabled: checked } : t));
                        }}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Security & Guardrails</h3>
                  <p className="text-xs text-muted-foreground">Policy engine và giới hạn bảo mật</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Confidence Threshold (Handoff)</Label>
                  <Input type="number" step="0.05" min="0" max="1" defaultValue="0.6" className="font-mono text-sm h-10 max-w-xs" />
                  <p className="text-[11px] text-muted-foreground">Bot sẽ chuyển agent khi confidence dưới ngưỡng này</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Max Tool Retries</Label>
                  <Input type="number" min="0" max="5" defaultValue="2" className="font-mono text-sm h-10 max-w-xs" />
                  <p className="text-[11px] text-muted-foreground">Số lần retry tối đa khi tool call fail trước khi handoff</p>
                </div>

                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">PII Masking</p>
                    <p className="text-xs text-muted-foreground">Tự động ẩn thông tin nhạy cảm trong log</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Prompt Injection Defense</p>
                    <p className="text-xs text-muted-foreground">Lọc và chặn các prompt injection attempt</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" className="gap-2 glow-primary">
                  <Save className="h-3.5 w-3.5" />
                  Lưu cấu hình
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default Settings;
