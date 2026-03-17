import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronDown, ChevronRight, Code2, Copy, ExternalLink, Info, Loader2, MessageCircle, Palette, Save, Send, Smartphone, User } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_FUNCTIONS_URL = (() => {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return "";
  return base.replace(/\/$/, "") + "/functions/v1";
})();

interface WidgetConfigState {
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
  title: string;
  subtitle: string;
  placeholder: string;
  welcomeMessage: string;
  collectName: boolean;
  collectEmail: boolean;
  collectPhone: boolean;
  collectRole: boolean;
  roleOptionsText: string;
  showPoweredBy: boolean;
  autoOpen: boolean;
  autoOpenDelay: number;
}

type ChannelType = "widget" | "telegram" | "zalo" | "whatsapp";

type ChannelBinding = {
  id?: string;
  enabled: boolean;
  status: "draft" | "configured" | "active" | "error" | "disabled";
  config: Record<string, any>;
  routing: Record<string, any>;
};

interface AgentChannelsTabProps {
  tenantId: string;
  tenantName: string;
  widgetConfig: WidgetConfigState;
  setWidgetConfig: (value: WidgetConfigState) => void;
  copied: boolean;
  embedCode: string;
  saving: boolean;
  onCopy: () => void;
  onSave: () => void;
}

const defaultBindings = (agentId = "default") => ({
  widget: {
    enabled: true,
    status: "configured",
    config: {},
    routing: { agentId, isPublicDefault: true, publicEntrypoint: true },
  },
  telegram: {
    enabled: false,
    status: "draft",
    config: {
      botToken: "",
      botUsername: "",
      webhookUrl: SUPABASE_FUNCTIONS_URL ? `${SUPABASE_FUNCTIONS_URL}/channel-telegram-webhook` : "",
      webhookSecret: "",
      allowFrom: "",
      requireMention: true,
    },
    routing: { agentId, deliveryMode: "webhook" },
  },
  zalo: {
    enabled: false,
    status: "draft",
    config: {
      oaId: "",
      appId: "",
      appSecret: "",
      accessToken: "",
      webhookUrl: SUPABASE_FUNCTIONS_URL ? `${SUPABASE_FUNCTIONS_URL}/channel-zalo-webhook` : "",
      verifyToken: "",
      apiBaseUrl: "https://openapi.zalo.me/v3.0/oa/message/cs",
    },
    routing: { agentId, deliveryMode: "webhook" },
  },
  whatsapp: {
    enabled: false,
    status: "draft",
    config: {
      phoneNumberId: "",
      accessToken: "",
      webhookVerifyToken: "",
      businessAccountId: "",
      apiVersion: "v23.0",
      webhookUrl: SUPABASE_FUNCTIONS_URL ? `${SUPABASE_FUNCTIONS_URL}/channel-whatsapp-webhook` : "",
    },
    routing: { agentId, deliveryMode: "cloud-api" },
  },
} satisfies Record<ChannelType, ChannelBinding>);

const channelMeta: Record<ChannelType, { label: string; icon: any; description: string }> = {
  widget: { label: "Widget", icon: Palette, description: "Website widget + embed code" },
  telegram: { label: "Telegram", icon: Send, description: "Bot token, webhook, allowlist" },
  zalo: { label: "Zalo", icon: Smartphone, description: "OA credentials + webhook verification" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, description: "Meta Cloud API credentials" },
};

const statusBadgeVariant = (status: string) => {
  if (status === "active") return "default" as const;
  if (status === "error") return "destructive" as const;
  return "secondary" as const;
};

const ProviderShell = ({
  title,
  description,
  enabled,
  status,
  onEnabledChange,
  saving,
  onSave,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  status: string;
  onEnabledChange: (enabled: boolean) => void;
  saving: boolean;
  onSave: () => void;
  children: ReactNode;
}) => (
  <div className="rounded-lg border bg-card p-6 space-y-5">
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant={statusBadgeVariant(status)} className="text-[10px]">{enabled ? status : "off"}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Enabled</Label>
          <Switch checked={enabled} onCheckedChange={onEnabledChange} />
        </div>
        <Button size="sm" className="gap-2 glow-primary" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Lưu
        </Button>
      </div>
    </div>
    {children}
  </div>
);

const SetupInstructions = ({ title, steps }: { title: string; steps: { label: string; detail?: string; code?: string }[] }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border bg-muted/30">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 w-full px-4 py-3 text-left text-sm font-medium hover:bg-muted/50 transition-colors rounded-lg">
        <Info className="h-4 w-4 text-primary shrink-0" />
        <span className="flex-1">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary mt-0.5">{i + 1}</span>
                <div className="space-y-1 min-w-0">
                  <p className="text-sm">{step.label}</p>
                  {step.detail && <p className="text-xs text-muted-foreground">{step.detail}</p>}
                  {step.code && <pre className="rounded bg-muted px-3 py-2 text-xs font-mono break-all whitespace-pre-wrap">{step.code}</pre>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

export const AgentChannelsTab = ({
  tenantId,
  tenantName,
  widgetConfig,
  setWidgetConfig,
  copied,
  embedCode,
  saving,
  onCopy,
  onSave,
}: AgentChannelsTabProps) => {
  const [channelTab, setChannelTab] = useState<ChannelType>("widget");
  const [bindings, setBindings] = useState<Record<ChannelType, ChannelBinding>>(defaultBindings());
  const [bindingsLoading, setBindingsLoading] = useState(true);
  const [bindingsSaving, setBindingsSaving] = useState<ChannelType | null>(null);
  const [bridgeAgentId, setBridgeAgentId] = useState<string>("default");

  useEffect(() => {
    const loadBindings = async () => {
      if (!tenantId) return;
      setBindingsLoading(true);
      try {
        let agentId = bridgeAgentId;
        const { data: existingAgent, error: existingError } = await supabase
          .from("agents" as any)
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle();
        if (existingError) throw existingError;

        if (existingAgent?.id) {
          agentId = existingAgent.id;
        } else {
          const { data: createdAgent, error: createError } = await supabase
            .from("agents" as any)
            .insert({
              tenant_id: tenantId,
              name: `${tenantName} Assistant`,
              slug: "default-agent",
              kind: "assistant",
              status: "active",
              is_default: true,
              public_name: `${tenantName} Assistant`,
            })
            .select("id")
            .single();
          if (createError) throw createError;
          agentId = createdAgent.id;
        }

        setBridgeAgentId(agentId);
        const next = defaultBindings(agentId);

        const { data: rows, error } = await supabase
          .from("agent_channel_bindings" as any)
          .select("id, channel_type, enabled, status, config, routing")
          .eq("agent_id", agentId);

        if (error && !String(error.message || "").includes("agent_channel_bindings")) throw error;

        for (const row of rows || []) {
          const type = row.channel_type as ChannelType;
          if (!next[type]) continue;
          next[type] = {
            id: row.id,
            enabled: !!row.enabled,
            status: row.status,
            config: row.config || {},
            routing: row.routing || { agentId },
          };
        }

        next.widget.config = {
          ...next.widget.config,
          title: widgetConfig.title,
          subtitle: widgetConfig.subtitle,
          placeholder: widgetConfig.placeholder,
          welcomeMessage: widgetConfig.welcomeMessage,
          primaryColor: widgetConfig.primaryColor,
          position: widgetConfig.position,
          collectName: widgetConfig.collectName,
          collectEmail: widgetConfig.collectEmail,
          collectPhone: widgetConfig.collectPhone,
          collectRole: widgetConfig.collectRole,
          roleOptionsText: widgetConfig.roleOptionsText,
          showPoweredBy: widgetConfig.showPoweredBy,
          autoOpen: widgetConfig.autoOpen,
          autoOpenDelay: widgetConfig.autoOpenDelay,
        };

        setBindings(next);
      } catch (err: any) {
        console.error("load channel bindings", err);
        toast.error(err.message || "Load channel bindings thất bại");
      } finally {
        setBindingsLoading(false);
      }
    };

    loadBindings();
  }, [tenantId, tenantName]);

  useEffect(() => {
    setBindings((prev) => ({
      ...prev,
      widget: {
        ...prev.widget,
        enabled: true,
        config: {
          ...prev.widget.config,
          title: widgetConfig.title,
          subtitle: widgetConfig.subtitle,
          placeholder: widgetConfig.placeholder,
          welcomeMessage: widgetConfig.welcomeMessage,
          primaryColor: widgetConfig.primaryColor,
          position: widgetConfig.position,
          collectName: widgetConfig.collectName,
          collectEmail: widgetConfig.collectEmail,
          collectPhone: widgetConfig.collectPhone,
          collectRole: widgetConfig.collectRole,
          roleOptionsText: widgetConfig.roleOptionsText,
          showPoweredBy: widgetConfig.showPoweredBy,
          autoOpen: widgetConfig.autoOpen,
          autoOpenDelay: widgetConfig.autoOpenDelay,
        },
        routing: {
          ...prev.widget.routing,
          agentId: bridgeAgentId,
          isPublicDefault: true,
          publicEntrypoint: true,
        },
      },
    }));
  }, [widgetConfig, bridgeAgentId]);

  const channelStatus = useMemo(() => {
    return (Object.keys(channelMeta) as ChannelType[]).map((type) => ({
      type,
      enabled: bindings[type]?.enabled,
      status: bindings[type]?.status || "draft",
    }));
  }, [bindings]);

  const updateBinding = (type: ChannelType, patch: Partial<ChannelBinding>) => {
    setBindings((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        ...patch,
      },
    }));
  };

  const updateBindingConfig = (type: ChannelType, patch: Record<string, any>) => {
    setBindings((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        config: { ...prev[type].config, ...patch },
      },
    }));
  };

  const saveBinding = async (type: ChannelType) => {
    if (!tenantId || !bridgeAgentId) return;
    setBindingsSaving(type);
    try {
      if (type === "widget") {
        await onSave();
      }

      const binding = bindings[type];
      const payload = {
        agent_id: bridgeAgentId,
        channel_type: type,
        enabled: binding.enabled,
        status: binding.enabled ? (type === "widget" ? "active" : "configured") : "disabled",
        config: binding.config,
        routing: { ...binding.routing, agentId: bridgeAgentId },
        metadata: { source: type === "widget" ? "tenant-detail-bridge" : "agent-channels-tab" },
      };

      if (binding.id) {
        const { error } = await supabase.from("agent_channel_bindings" as any).update(payload).eq("id", binding.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("agent_channel_bindings" as any).insert(payload).select("id").single();
        if (error) throw error;
        updateBinding(type, { id: data.id });
      }

      updateBinding(type, { status: payload.status });
      toast.success(`${channelMeta[type].label} config đã lưu`);
    } catch (err: any) {
      console.error("save binding", err);
      toast.error(err.message || `Lưu ${channelMeta[type].label} thất bại`);
      updateBinding(type, { status: "error" });
    } finally {
      setBindingsSaving(null);
    }
  };

  const telegram = bindings.telegram;
  const zalo = bindings.zalo;
  const whatsapp = bindings.whatsapp;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        Channels hiện đã hỗ trợ config shell cho <strong>Widget</strong>, <strong>Telegram</strong>, <strong>Zalo</strong>, và <strong>WhatsApp</strong>.
        Runtime thật hiện mới dùng Widget/Embed; các provider còn lại đang ở mức binding/config-ready.
      </div>

      <div className="flex flex-wrap gap-2">
        {channelStatus.map(({ type, enabled, status }) => {
          const meta = channelMeta[type];
          const Icon = meta.icon;
          return (
            <button
              key={type}
              onClick={() => setChannelTab(type)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${channelTab === type ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-muted/50"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
              <Badge variant={enabled ? "default" : "secondary"} className="h-5 px-1.5 text-[10px]">{enabled ? status : "off"}</Badge>
            </button>
          );
        })}
      </div>

      {bindingsLoading ? (
        <div className="rounded-lg border bg-card p-10 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Đang tải channel bindings...
        </div>
      ) : (
        <Tabs value={channelTab} onValueChange={(v) => setChannelTab(v as ChannelType)} className="space-y-6">
          <TabsList className="hidden">
            <TabsTrigger value="widget">Widget</TabsTrigger>
            <TabsTrigger value="telegram">Telegram</TabsTrigger>
            <TabsTrigger value="zalo">Zalo</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          </TabsList>

          <TabsContent value="widget" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ProviderShell
                title="Widget"
                description="Website widget popup + public embed routing"
                enabled={bindings.widget.enabled}
                status={bindings.widget.status}
                onEnabledChange={(enabled) => updateBinding("widget", { enabled })}
                saving={saving || bindingsSaving === "widget"}
                onSave={() => saveBinding("widget")}
              >
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
                          <button key={pos} onClick={() => setWidgetConfig({ ...widgetConfig, position: pos })} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${widgetConfig.position === pos ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50"}`}>
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
                        <Input value={widgetConfig.roleOptionsText} onChange={(e) => setWidgetConfig({ ...widgetConfig, roleOptionsText: e.target.value })} className="h-9 text-xs" placeholder="Người tạo đơn hàng, Kế toán, Quản lý" />
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
              </ProviderShell>

              <div className="space-y-6">
                <div className="rounded-lg border bg-card p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Code2 className="h-5 w-5 text-primary" /></div>
                      <div><h3 className="text-sm font-semibold">Embed Code</h3><p className="text-xs text-muted-foreground">Copy vào website</p></div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={onCopy}>
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

          <TabsContent value="telegram" className="space-y-6">
            <SetupInstructions
              title="Hướng dẫn cài đặt Telegram Bot"
              steps={[
                {
                  label: "Tạo bot mới qua @BotFather trên Telegram",
                  detail: "Gửi lệnh /newbot, đặt tên và username (phải kết thúc bằng 'bot'). BotFather sẽ trả về Bot Token.",
                },
                {
                  label: "Copy Bot Token vào ô bên dưới",
                  detail: "Dạng: 123456789:ABCDEFGHIJ... — giữ bí mật, không chia sẻ.",
                },
                {
                  label: "Điền Bot Username (không cần @)",
                  detail: "Ví dụ: my_support_bot — dùng để routing đúng khi nhiều bot dùng chung webhook URL.",
                },
                {
                  label: "Webhook URL đã được tự động điền từ Supabase project của bạn",
                  detail: "Đây là URL endpoint nhận tin nhắn từ Telegram. Sau khi lưu config, dùng lệnh sau để đăng ký webhook với Telegram:",
                  code: telegram.config.botToken
                    ? `curl "https://api.telegram.org/bot${telegram.config.botToken}/setWebhook?url=${encodeURIComponent(telegram.config.webhookUrl || "")}"`
                    : `curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<WEBHOOK_URL>"`,
                },
                {
                  label: "(Tuỳ chọn) Đặt Webhook Secret để bảo mật",
                  detail: "Nếu đặt, mọi request từ Telegram đều phải có header X-Telegram-Bot-Api-Secret-Token khớp giá trị này.",
                },
                {
                  label: "(Tuỳ chọn) Allow From: giới hạn user ID hoặc username được phép nhắn",
                  detail: "Nhập danh sách user ID hoặc @username phân tách bằng dấu phẩy. Để trống = cho phép tất cả.",
                },
                {
                  label: "Bật Enabled và nhấn Lưu",
                  detail: "Sau khi lưu, test bằng cách gửi /start cho bot trên Telegram.",
                },
              ]}
            />
            <ProviderShell
              title="Telegram"
              description="Bot token + webhook + allowlist cho Telegram bot integration"
              enabled={telegram.enabled}
              status={telegram.status}
              onEnabledChange={(enabled) => updateBinding("telegram", { enabled })}
              saving={bindingsSaving === "telegram"}
              onSave={() => saveBinding("telegram")}
            >
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Bot Token</Label>
                  <Input value={telegram.config.botToken || ""} onChange={(e) => updateBindingConfig("telegram", { botToken: e.target.value })} placeholder="123456:ABCDEF" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Bot Username</Label>
                  <Input value={telegram.config.botUsername || ""} onChange={(e) => updateBindingConfig("telegram", { botUsername: e.target.value })} placeholder="my_support_bot" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    Webhook URL
                    <span className="text-[10px] text-primary font-normal bg-primary/10 px-1.5 py-0.5 rounded">tự động điền</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input value={telegram.config.webhookUrl || ""} onChange={(e) => updateBindingConfig("telegram", { webhookUrl: e.target.value })} className="font-mono text-sm flex-1" />
                    {telegram.config.webhookUrl && (
                      <Button variant="outline" size="sm" className="shrink-0" onClick={() => { navigator.clipboard.writeText(telegram.config.webhookUrl); toast.success("Đã copy webhook URL"); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Webhook Secret</Label>
                  <Input value={telegram.config.webhookSecret || ""} onChange={(e) => updateBindingConfig("telegram", { webhookSecret: e.target.value })} placeholder="telegram-secret" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Allow From (user IDs hoặc @username, phân tách bằng dấu phẩy)</Label>
                  <Input value={telegram.config.allowFrom || ""} onChange={(e) => updateBindingConfig("telegram", { allowFrom: e.target.value })} placeholder="123456789, @myusername" />
                </div>
              </div>
              <div className="rounded-lg border p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Require mention in groups</p>
                  <p className="text-xs text-muted-foreground">Bot chỉ trả lời khi được @mention trong group chat.</p>
                </div>
                <Switch checked={!!telegram.config.requireMention} onCheckedChange={(v) => updateBindingConfig("telegram", { requireMention: v })} />
              </div>
              {telegram.config.botToken && telegram.enabled && (
                <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><ExternalLink className="h-3.5 w-3.5" />Đăng ký webhook với Telegram</p>
                  <pre className="text-xs font-mono break-all whitespace-pre-wrap text-foreground/80">{`curl "https://api.telegram.org/bot${telegram.config.botToken}/setWebhook?url=${encodeURIComponent(telegram.config.webhookUrl || "")}"`}</pre>
                  <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => { navigator.clipboard.writeText(`curl "https://api.telegram.org/bot${telegram.config.botToken}/setWebhook?url=${encodeURIComponent(telegram.config.webhookUrl || "")}"`); toast.success("Đã copy lệnh curl"); }}>
                    <Copy className="h-3.5 w-3.5" />Copy lệnh đăng ký webhook
                  </Button>
                </div>
              )}
            </ProviderShell>
          </TabsContent>

          <TabsContent value="zalo" className="space-y-6">
            <SetupInstructions
              title="Hướng dẫn cài đặt Zalo OA"
              steps={[
                {
                  label: "Tạo Zalo Official Account tại developers.zalo.me",
                  detail: "Vào My Apps → Tạo ứng dụng mới → Chọn loại Official Account.",
                },
                {
                  label: "Lấy OA ID, App ID và App Secret",
                  detail: "Trong trang quản lý ứng dụng, tab Thông tin cơ bản.",
                },
                {
                  label: "Tạo Access Token",
                  detail: "Vào tab Xác thực → Tạo token → Copy Access Token dài hạn.",
                },
                {
                  label: "Webhook URL đã được tự động điền",
                  detail: "Đăng ký URL này trong Zalo Developer Console → Webhook → Cập nhật URL endpoint.",
                },
                {
                  label: "Tạo Verify Token (tự chọn chuỗi bất kỳ)",
                  detail: "Dùng cùng giá trị trong console Zalo và ô Verify Token bên dưới. Zalo sẽ gọi webhook với token này để xác minh.",
                },
                {
                  label: "Bật Enabled và nhấn Lưu",
                  detail: "Test bằng cách gửi tin nhắn tới Zalo OA của bạn.",
                },
              ]}
            />
            <ProviderShell
              title="Zalo OA"
              description="Official Account credentials + webhook verification cho Zalo"
              enabled={zalo.enabled}
              status={zalo.status}
              onEnabledChange={(enabled) => updateBinding("zalo", { enabled })}
              saving={bindingsSaving === "zalo"}
              onSave={() => saveBinding("zalo")}
            >
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">OA ID</Label>
                  <Input value={zalo.config.oaId || ""} onChange={(e) => updateBindingConfig("zalo", { oaId: e.target.value })} placeholder="zalo-oa-id" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">App ID</Label>
                  <Input value={zalo.config.appId || ""} onChange={(e) => updateBindingConfig("zalo", { appId: e.target.value })} placeholder="zalo-app-id" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">App Secret</Label>
                  <Input value={zalo.config.appSecret || ""} onChange={(e) => updateBindingConfig("zalo", { appSecret: e.target.value })} placeholder="zalo-app-secret" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Access Token</Label>
                  <Input value={zalo.config.accessToken || ""} onChange={(e) => updateBindingConfig("zalo", { accessToken: e.target.value })} placeholder="zalo-access-token" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Verify Token</Label>
                  <Input value={zalo.config.verifyToken || ""} onChange={(e) => updateBindingConfig("zalo", { verifyToken: e.target.value })} placeholder="zalo-verify-token" className="font-mono text-sm" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    Webhook URL
                    <span className="text-[10px] text-primary font-normal bg-primary/10 px-1.5 py-0.5 rounded">tự động điền</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input value={zalo.config.webhookUrl || ""} onChange={(e) => updateBindingConfig("zalo", { webhookUrl: e.target.value })} className="font-mono text-sm flex-1" />
                    {zalo.config.webhookUrl && (
                      <Button variant="outline" size="sm" className="shrink-0" onClick={() => { navigator.clipboard.writeText(zalo.config.webhookUrl); toast.success("Đã copy webhook URL"); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs">Send API Base URL</Label>
                  <Input value={zalo.config.apiBaseUrl || ""} onChange={(e) => updateBindingConfig("zalo", { apiBaseUrl: e.target.value })} placeholder="https://openapi.zalo.me/v3.0/oa/message/cs" className="font-mono text-sm" />
                </div>
              </div>
            </ProviderShell>
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-6">
            <SetupInstructions
              title="Hướng dẫn cài đặt WhatsApp Cloud API"
              steps={[
                {
                  label: "Tạo tài khoản Meta Developer tại developers.facebook.com",
                  detail: "Vào My Apps → Create App → Business → Thêm sản phẩm WhatsApp.",
                },
                {
                  label: "Lấy Phone Number ID và Business Account ID",
                  detail: "Trong WhatsApp → Getting Started → API Setup. Phone Number ID là số điện thoại test mặc định hoặc số thực của bạn.",
                },
                {
                  label: "Tạo Permanent Access Token",
                  detail: "Vào Business Settings → System Users → Tạo system user → Generate Token với quyền whatsapp_business_messaging.",
                },
                {
                  label: "Đăng ký Webhook trong Meta Developer Console",
                  detail: "WhatsApp → Configuration → Webhook → Edit. Dán Webhook URL (đã tự động điền) và Verify Token vào.",
                },
                {
                  label: "Subscribe các webhook fields cần thiết",
                  detail: "Chọn ít nhất: messages. Meta sẽ gọi webhook GET để xác minh trước khi nhận tin nhắn.",
                },
                {
                  label: "Bật Enabled và nhấn Lưu",
                  detail: "Test bằng cách gửi tin nhắn WhatsApp tới số điện thoại test.",
                },
              ]}
            />
            <ProviderShell
              title="WhatsApp Cloud API"
              description="Meta WhatsApp Business credentials cho inbound/outbound integration"
              enabled={whatsapp.enabled}
              status={whatsapp.status}
              onEnabledChange={(enabled) => updateBinding("whatsapp", { enabled })}
              saving={bindingsSaving === "whatsapp"}
              onSave={() => saveBinding("whatsapp")}
            >
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Phone Number ID</Label>
                  <Input value={whatsapp.config.phoneNumberId || ""} onChange={(e) => updateBindingConfig("whatsapp", { phoneNumberId: e.target.value })} placeholder="phone-number-id" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Business Account ID</Label>
                  <Input value={whatsapp.config.businessAccountId || ""} onChange={(e) => updateBindingConfig("whatsapp", { businessAccountId: e.target.value })} placeholder="business-account-id" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs">Access Token</Label>
                  <Input value={whatsapp.config.accessToken || ""} onChange={(e) => updateBindingConfig("whatsapp", { accessToken: e.target.value })} placeholder="EAAG..." className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">API Version</Label>
                  <Input value={whatsapp.config.apiVersion || "v23.0"} onChange={(e) => updateBindingConfig("whatsapp", { apiVersion: e.target.value })} placeholder="v23.0" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Webhook Verify Token</Label>
                  <Input value={whatsapp.config.webhookVerifyToken || ""} onChange={(e) => updateBindingConfig("whatsapp", { webhookVerifyToken: e.target.value })} placeholder="whatsapp-verify-token" className="font-mono text-sm" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    Webhook URL
                    <span className="text-[10px] text-primary font-normal bg-primary/10 px-1.5 py-0.5 rounded">tự động điền</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input value={whatsapp.config.webhookUrl || ""} onChange={(e) => updateBindingConfig("whatsapp", { webhookUrl: e.target.value })} className="font-mono text-sm flex-1" />
                    {whatsapp.config.webhookUrl && (
                      <Button variant="outline" size="sm" className="shrink-0" onClick={() => { navigator.clipboard.writeText(whatsapp.config.webhookUrl); toast.success("Đã copy webhook URL"); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </ProviderShell>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};
