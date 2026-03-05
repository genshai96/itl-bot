import { useState, useEffect } from "react";
import { toast } from "sonner";
import AdminLayout from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { User, Save, Loader2, Shield, Key, Webhook, Copy, Eye, EyeOff, BrainCircuit, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useTenants, useTenantConfig, useUpdateTenantConfig } from "@/hooks/use-data";

const Settings = () => {
  const { user } = useAuth();
  const { data: tenants } = useTenants();
  const firstTenant = tenants?.[0];
  const { data: config } = useTenantConfig(firstTenant?.id || "");
  const updateConfig = useUpdateTenantConfig();

  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  // Webhook & notification
  const [webhookUrl, setWebhookUrl] = useState("");
  const [notifEmail, setNotifEmail] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // Embedding provider
  const [embEndpoint, setEmbEndpoint] = useState("");
  const [embApiKey, setEmbApiKey] = useState("");
  const [embModel, setEmbModel] = useState("");
  const [showEmbKey, setShowEmbKey] = useState(false);
  const [testingEmb, setTestingEmb] = useState(false);
  const [embTestResult, setEmbTestResult] = useState<"success" | "error" | null>(null);

  // Load profile
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
      });
  }, [user]);

  // Load config settings
  useEffect(() => {
    if (!config) return;
    setWebhookUrl((config as any).webhook_url || "");
    setNotifEmail((config as any).notification_email || "");
    setEmbEndpoint(config.provider_endpoint || "");
    setEmbApiKey(config.provider_api_key || "");
    setEmbModel(config.provider_model || "");
  }, [config]);

  const saveProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() })
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Đã cập nhật profile");
    } catch (err: any) {
      toast.error(err.message || "Lỗi cập nhật");
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    if (pwNew.length < 6) { toast.error("Mật khẩu tối thiểu 6 ký tự"); return; }
    if (pwNew !== pwConfirm) { toast.error("Mật khẩu không khớp"); return; }
    setChangingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw error;
      toast.success("Đổi mật khẩu thành công");
      setPwNew(""); setPwConfirm("");
    } catch (err: any) {
      toast.error(err.message || "Lỗi đổi mật khẩu");
    } finally {
      setChangingPw(false);
    }
  };

  const saveWebhookSettings = async () => {
    if (!firstTenant) return;
    updateConfig.mutate({
      tenantId: firstTenant.id,
      config: { webhook_url: webhookUrl, notification_email: notifEmail } as any,
    });
    toast.success("Đã cập nhật webhook & notification");
  };

  const generateApiKey = async () => {
    if (!firstTenant) return;
    const key = `sk_${crypto.randomUUID().replace(/-/g, "")}`;
    updateConfig.mutate({
      tenantId: firstTenant.id,
      config: { api_key: key } as any,
    });
    toast.success("API key đã được tạo mới");
  };

  const copyApiKey = () => {
    if (config && (config as any).api_key) {
      navigator.clipboard.writeText((config as any).api_key);
      toast.success("Đã copy API key");
    }
  };

  const saveEmbeddingConfig = async () => {
    if (!firstTenant) return;
    updateConfig.mutate({
      tenantId: firstTenant.id,
      config: {
        provider_endpoint: embEndpoint,
        provider_api_key: embApiKey,
        provider_model: embModel || "text-embedding-3-small",
      } as any,
    });
    toast.success("Đã lưu cấu hình Embedding Provider");
  };

  const testEmbeddingConnection = async () => {
    if (!embEndpoint || !embApiKey) {
      toast.error("Vui lòng nhập endpoint và API key");
      return;
    }
    setTestingEmb(true);
    setEmbTestResult(null);
    try {
      const baseUrl = embEndpoint.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${embApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: embModel || "text-embedding-3-small",
          input: ["test connection"],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data?.data?.[0]?.embedding) {
        setEmbTestResult("success");
        toast.success(`Kết nối thành công! Dimension: ${data.data[0].embedding.length}`);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err: any) {
      setEmbTestResult("error");
      toast.error("Kết nối thất bại: " + (err.message || ""));
    } finally {
      setTestingEmb(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-2xl space-y-8 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Quản lý tài khoản, bảo mật, embedding và tích hợp</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-muted/50 flex-wrap">
            <TabsTrigger value="profile" className="gap-2 text-xs"><User className="h-3.5 w-3.5" />Profile</TabsTrigger>
            <TabsTrigger value="security" className="gap-2 text-xs"><Shield className="h-3.5 w-3.5" />Bảo mật</TabsTrigger>
            <TabsTrigger value="embedding" className="gap-2 text-xs"><BrainCircuit className="h-3.5 w-3.5" />Embedding</TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-2 text-xs"><Webhook className="h-3.5 w-3.5" />Webhooks</TabsTrigger>
            <TabsTrigger value="api" className="gap-2 text-xs"><Key className="h-3.5 w-3.5" />API Keys</TabsTrigger>
          </TabsList>

          {/* Profile tab */}
          <TabsContent value="profile" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                  {(user?.email || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">ID: {user?.id?.slice(0, 8)}...</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Email</Label>
                  <Input value={user?.email || ""} readOnly className="h-10 bg-muted/50" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Tên hiển thị</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Tên hiển thị" className="h-10" maxLength={100} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="gap-2 glow-primary" onClick={saveProfile} disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Lưu
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Security tab */}
          <TabsContent value="security" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Key className="h-5 w-5 text-primary" /></div>
                <div>
                  <h3 className="text-sm font-semibold">Đổi mật khẩu</h3>
                  <p className="text-xs text-muted-foreground">Cập nhật mật khẩu tài khoản</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Mật khẩu mới</Label>
                  <Input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} placeholder="••••••••" className="h-10" minLength={6} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Xác nhận mật khẩu</Label>
                  <Input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} placeholder="••••••••" className="h-10" minLength={6} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="gap-2 glow-primary" onClick={changePassword} disabled={changingPw}>
                  {changingPw ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                  Đổi mật khẩu
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Embedding Provider tab */}
          <TabsContent value="embedding" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10"><BrainCircuit className="h-5 w-5 text-info" /></div>
                <div>
                  <h3 className="text-sm font-semibold">Embedding Provider</h3>
                  <p className="text-xs text-muted-foreground">Cấu hình API tạo embeddings cho Knowledge Base (RAG)</p>
                </div>
              </div>

              <div className="rounded-lg bg-muted/30 border p-4 space-y-2">
                <p className="text-xs font-semibold">Hướng dẫn:</p>
                <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
                  <li><strong>OpenAI:</strong> Endpoint = <code className="text-[10px] bg-muted px-1 rounded">https://api.openai.com/v1</code>, Model = <code className="text-[10px] bg-muted px-1 rounded">text-embedding-3-small</code></li>
                  <li><strong>Azure OpenAI:</strong> Endpoint = <code className="text-[10px] bg-muted px-1 rounded">https://YOUR.openai.azure.com/openai</code></li>
                  <li><strong>OpenRouter / Together / Fireworks:</strong> Dùng endpoint tương ứng, model hỗ trợ embeddings</li>
                  <li>API key sẽ được lưu an toàn trong database (mã hóa)</li>
                </ul>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">API Base URL</Label>
                  <Input
                    value={embEndpoint}
                    onChange={(e) => setEmbEndpoint(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="h-10 font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showEmbKey ? "text" : "password"}
                      value={embApiKey}
                      onChange={(e) => setEmbApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="h-10 font-mono text-xs flex-1"
                    />
                    <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setShowEmbKey(!showEmbKey)}>
                      {showEmbKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Embedding Model</Label>
                  <Input
                    value={embModel}
                    onChange={(e) => setEmbModel(e.target.value)}
                    placeholder="text-embedding-3-small"
                    className="h-10 font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">Mặc định: text-embedding-3-small (1536 dimensions)</p>
                </div>
              </div>

              {embTestResult && (
                <div className={`flex items-center gap-2 rounded-lg p-3 text-xs ${
                  embTestResult === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                }`}>
                  {embTestResult === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {embTestResult === "success" ? "Kết nối thành công!" : "Kết nối thất bại"}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" className="gap-2" onClick={testEmbeddingConnection} disabled={testingEmb}>
                  {testingEmb ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
                  Test kết nối
                </Button>
                <Button size="sm" className="gap-2 glow-primary" onClick={saveEmbeddingConfig}>
                  <Save className="h-3.5 w-3.5" />
                  Lưu
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Webhooks tab */}
          <TabsContent value="webhooks" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10"><Webhook className="h-5 w-5 text-info" /></div>
                <div>
                  <h3 className="text-sm font-semibold">Webhook & Notifications</h3>
                  <p className="text-xs text-muted-foreground">Nhận thông báo khi có sự kiện mới</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Webhook URL</Label>
                  <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://your-server.com/webhook" className="h-10 font-mono text-xs" />
                  <p className="text-[10px] text-muted-foreground">Nhận POST request khi có conversation mới, handoff, etc.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Email thông báo</Label>
                  <Input value={notifEmail} onChange={(e) => setNotifEmail(e.target.value)} placeholder="admin@example.com" className="h-10" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="gap-2 glow-primary" onClick={saveWebhookSettings}>
                  <Save className="h-3.5 w-3.5" />
                  Lưu
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* API Keys tab */}
          <TabsContent value="api" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10"><Key className="h-5 w-5 text-warning" /></div>
                <div>
                  <h3 className="text-sm font-semibold">API Key Management</h3>
                  <p className="text-xs text-muted-foreground">Quản lý API keys để tích hợp bên ngoài</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">API Key hiện tại</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={config && (config as any).api_key ? (showApiKey ? (config as any).api_key : "••••••••••••••••") : "Chưa tạo"}
                      readOnly
                      className="h-10 font-mono text-xs bg-muted/50 flex-1"
                    />
                    <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setShowApiKey(!showApiKey)}>
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-10 w-10" onClick={copyApiKey} disabled={!config || !(config as any).api_key}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="gap-2" onClick={generateApiKey}>
                  <Key className="h-3.5 w-3.5" />
                  Tạo API Key mới
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
