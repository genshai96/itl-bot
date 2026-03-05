import { useState, useEffect } from "react";
import { toast } from "sonner";
import AdminLayout from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { User, Save, Loader2, Shield, Key, Bell, Webhook, Copy, Eye, EyeOff } from "lucide-react";
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
    try {
      updateConfig.mutate({
        tenantId: firstTenant.id,
        config: { webhook_url: webhookUrl, notification_email: notifEmail } as any,
      });
      toast.success("Đã cập nhật webhook & notification");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const generateApiKey = async () => {
    if (!firstTenant) return;
    const key = `sk_${crypto.randomUUID().replace(/-/g, "")}`;
    try {
      updateConfig.mutate({
        tenantId: firstTenant.id,
        config: { api_key: key } as any,
      });
      toast.success("API key đã được tạo mới");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const copyApiKey = () => {
    if (config && (config as any).api_key) {
      navigator.clipboard.writeText((config as any).api_key);
      toast.success("Đã copy API key");
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-2xl space-y-8 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Quản lý tài khoản, bảo mật và tích hợp</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="profile" className="gap-2 text-xs"><User className="h-3.5 w-3.5" />Profile</TabsTrigger>
            <TabsTrigger value="security" className="gap-2 text-xs"><Shield className="h-3.5 w-3.5" />Bảo mật</TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-2 text-xs"><Webhook className="h-3.5 w-3.5" />Webhooks</TabsTrigger>
            <TabsTrigger value="api" className="gap-2 text-xs"><Key className="h-3.5 w-3.5" />API Keys</TabsTrigger>
          </TabsList>

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
                  <Input
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://your-server.com/webhook"
                    className="h-10 font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">Nhận POST request khi có conversation mới, handoff, etc.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Email thông báo</Label>
                  <Input
                    value={notifEmail}
                    onChange={(e) => setNotifEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="h-10"
                  />
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
