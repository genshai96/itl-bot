import ChatWidgetPreview from "@/components/widget/ChatWidgetPreview";

/**
 * Public page to demo/test the embeddable chat widget.
 * Accessed via /widget-demo?tenant=acme-corp
 */
const WidgetDemo = () => {
  return (
    <div className="min-h-screen bg-background p-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold">Website của khách hàng</h1>
        <p className="text-muted-foreground">
          Đây là trang web mô phỏng của tenant. Widget chat AI Support sẽ xuất hiện ở góc dưới bên phải.
        </p>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-6">
              <div className="h-4 w-3/4 bg-muted rounded mb-3" />
              <div className="h-3 w-full bg-muted/60 rounded mb-2" />
              <div className="h-3 w-5/6 bg-muted/60 rounded mb-2" />
              <div className="h-3 w-2/3 bg-muted/60 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* The widget */}
      <ChatWidgetPreview
        config={{
          tenantId: "acme-corp",
          primaryColor: "#0d9488",
          position: "bottom-right",
          title: "Hỗ trợ Acme Corp",
          subtitle: "AI trả lời 24/7",
          placeholder: "Hỏi gì đó...",
          welcomeMessage: "Xin chào! 👋 Tôi là AI Support của Acme Corp. Tôi có thể giúp gì cho bạn?",
          collectName: true,
          collectEmail: true,
          collectPhone: false,
        }}
      />
    </div>
  );
};

export default WidgetDemo;
