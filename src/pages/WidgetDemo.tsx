import { useState, useMemo } from "react";
import ChatWidgetPreview from "@/components/widget/ChatWidgetPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Code, Eye, Check } from "lucide-react";
import { toast } from "sonner";

const WidgetDemo = () => {
  const [tenantSlug, setTenantSlug] = useState("acme-corp");
  const [copied, setCopied] = useState(false);

  const embedCode = useMemo(() => {
    const baseUrl = window.location.origin;
    return `<!-- AI Support Widget -->
<script>
(function() {
  var w = document.createElement('div');
  w.id = 'ai-support-widget';
  document.body.appendChild(w);
  
  var s = document.createElement('script');
  s.src = '${baseUrl}/widget.js';
  s.setAttribute('data-tenant', '${tenantSlug}');
  s.setAttribute('data-position', 'bottom-right');
  s.async = true;
  document.body.appendChild(s);
})();
</script>`;
  }, [tenantSlug]);

  const iframeEmbed = useMemo(() => {
    const baseUrl = window.location.origin;
    return `<iframe 
  src="${baseUrl}/widget-demo?tenant=${tenantSlug}&embed=true"
  style="position:fixed;bottom:20px;right:20px;width:380px;height:600px;border:none;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.15);z-index:9999;"
  allow="clipboard-write"
></iframe>`;
  }, [tenantSlug]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Đã copy embed code");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Widget Demo & Embed</h1>
          <p className="text-muted-foreground mt-2">
            Xem preview widget và lấy code để nhúng vào website
          </p>
        </div>

        <Tabs defaultValue="preview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="preview" className="gap-2"><Eye className="h-3.5 w-3.5" />Preview</TabsTrigger>
            <TabsTrigger value="embed" className="gap-2"><Code className="h-3.5 w-3.5" />Embed Code</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Tenant Slug</Label>
                <Input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} className="max-w-sm h-9" placeholder="acme-corp" />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-8">
              <h2 className="text-xl font-semibold mb-4">Website mô phỏng</h2>
              <p className="text-muted-foreground mb-6">Widget chat sẽ xuất hiện ở góc dưới bên phải.</p>
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-lg border bg-card p-6">
                    <div className="h-4 w-3/4 bg-muted rounded mb-3" />
                    <div className="h-3 w-full bg-muted/60 rounded mb-2" />
                    <div className="h-3 w-5/6 bg-muted/60 rounded mb-2" />
                    <div className="h-3 w-2/3 bg-muted/60 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="embed" className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Tenant Slug cho embed</Label>
                <Input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} className="max-w-sm h-9" placeholder="acme-corp" />
              </div>
            </div>

            {/* Script embed */}
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Script Embed</h3>
                  <p className="text-xs text-muted-foreground">Dán vào trước &lt;/body&gt; trong HTML</p>
                </div>
                <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={() => copyCode(embedCode)}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy
                </Button>
              </div>
              <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-muted-foreground border">
                {embedCode}
              </pre>
            </div>

            {/* Iframe embed */}
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Iframe Embed</h3>
                  <p className="text-xs text-muted-foreground">Phương án thay thế dùng iframe</p>
                </div>
                <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={() => copyCode(iframeEmbed)}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy
                </Button>
              </div>
              <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-muted-foreground border">
                {iframeEmbed}
              </pre>
            </div>

            {/* API Integration */}
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <h3 className="text-sm font-semibold">REST API Integration</h3>
              <p className="text-xs text-muted-foreground">Gọi trực tiếp API để tích hợp tuỳ chỉnh</p>
              <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-muted-foreground border">
{`// Send message
POST /functions/v1/chat
Content-Type: application/json

{
  "tenant_id": "${tenantSlug}",
  "message": "Xin chào!",
  "end_user": {
    "name": "Nguyen Van A",
    "email": "a@example.com"
  }
}

// Response
{
  "conversation_id": "uuid",
  "response": "Xin chào! Tôi có thể giúp gì?",
  "sources": ["FAQ.pdf"]
}`}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Widget preview */}
      <ChatWidgetPreview
        config={{
          tenantId: tenantSlug,
          primaryColor: "#0d9488",
          position: "bottom-right",
          title: "Hỗ trợ AI",
          subtitle: "AI trả lời 24/7",
          placeholder: "Hỏi gì đó...",
          welcomeMessage: "Xin chào! 👋 Tôi là AI Support. Tôi có thể giúp gì cho bạn?",
          collectName: true,
          collectEmail: true,
          collectPhone: false,
        }}
      />
    </div>
  );
};

export default WidgetDemo;
