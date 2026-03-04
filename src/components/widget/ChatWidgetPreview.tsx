import { useState } from "react";
import { MessageSquare, X, Send, Minus, User, Loader2 } from "lucide-react";
import { sendChatMessage } from "@/lib/api";

interface WidgetConfig {
  tenantId: string;
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
  title: string;
  subtitle: string;
  placeholder: string;
  welcomeMessage: string;
  collectName: boolean;
  collectEmail: boolean;
  collectPhone: boolean;
}

const defaultConfig: WidgetConfig = {
  tenantId: "demo",
  primaryColor: "#0d9488",
  position: "bottom-right",
  title: "AI Support",
  subtitle: "Chúng tôi sẵn sàng giúp bạn",
  placeholder: "Nhập câu hỏi của bạn...",
  welcomeMessage: "Xin chào! 👋 Tôi có thể giúp gì cho bạn?",
  collectName: true,
  collectEmail: true,
  collectPhone: false,
};

interface ChatMessage {
  id: number;
  role: "user" | "bot";
  content: string;
  time: string;
}

/**
 * Standalone embeddable chat widget.
 * In production this would be loaded via <script> tag and rendered in an iframe/shadow DOM.
 * For demo purposes, render directly as a React component.
 */
const ChatWidgetPreview = ({ config = defaultConfig }: { config?: WidgetConfig }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"info" | "chat">("info");
  const [userInfo, setUserInfo] = useState({ name: "", email: "", phone: "" });
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, role: "bot", content: config.welcomeMessage, time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();

  const needsInfo = config.collectName || config.collectEmail || config.collectPhone;

  const handleStartChat = () => {
    setStep("chat");
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const now = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    const userMsg: ChatMessage = { id: Date.now(), role: "user", content: input, time: now };
    setMessages((prev) => [...prev, userMsg]);
    const msgText = input;
    setInput("");
    setIsLoading(true);

    try {
      const result = await sendChatMessage({
        tenantId: config.tenantId,
        message: msgText,
        conversationId,
        endUser: { name: userInfo.name, email: userInfo.email, phone: userInfo.phone },
      });

      if (result.conversation_id) setConversationId(result.conversation_id);

      const botMsg: ChatMessage = {
        id: Date.now() + 1,
        role: "bot",
        content: result.response,
        time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [...prev, {
        id: Date.now() + 1,
        role: "bot",
        content: "Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.",
        time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`fixed bottom-6 z-50 ${config.position === "bottom-right" ? "right-6" : "left-6"}`}>
      {/* Chat window */}
      {isOpen && (
        <div className="mb-4 w-[360px] rounded-2xl bg-card border shadow-lg overflow-hidden animate-slide-in"
          style={{ boxShadow: `0 12px 40px ${config.primaryColor}25` }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4" style={{ background: config.primaryColor }}>
            <div>
              <h4 className="text-sm font-semibold" style={{ color: "white" }}>{config.title}</h4>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.8)" }}>{config.subtitle}</p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setIsOpen(false)} className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                <Minus className="h-4 w-4" style={{ color: "white" }} />
              </button>
              <button onClick={() => setIsOpen(false)} className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                <X className="h-4 w-4" style={{ color: "white" }} />
              </button>
            </div>
          </div>

          {/* Info collection step */}
          {step === "info" && needsInfo ? (
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">Vui lòng cung cấp thông tin để bắt đầu chat:</p>
              {config.collectName && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Họ tên</label>
                  <input
                    value={userInfo.name}
                    onChange={(e) => setUserInfo({ ...userInfo, name: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Nguyễn Văn A"
                  />
                </div>
              )}
              {config.collectEmail && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Email</label>
                  <input
                    value={userInfo.email}
                    onChange={(e) => setUserInfo({ ...userInfo, email: e.target.value })}
                    type="email"
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="email@company.com"
                  />
                </div>
              )}
              {config.collectPhone && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Số điện thoại</label>
                  <input
                    value={userInfo.phone}
                    onChange={(e) => setUserInfo({ ...userInfo, phone: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="0912 345 678"
                  />
                </div>
              )}
              <button
                onClick={handleStartChat}
                className="w-full rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: config.primaryColor }}
              >
                Bắt đầu chat
              </button>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="h-80 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.role === "user"
                          ? "rounded-br-md text-white"
                          : "chat-bubble-bot"
                      }`}
                      style={msg.role === "user" ? { background: config.primaryColor } : undefined}
                    >
                      {msg.content}
                      <p className={`text-[10px] mt-1 ${msg.role === "user" ? "text-white/60" : "text-muted-foreground"}`}>{msg.time}</p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="chat-bubble-bot text-xs flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Đang xử lý...
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder={config.placeholder}
                    disabled={isLoading}
                    className="flex-1 rounded-full border px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  />
                  <button
                    onClick={handleSend}
                    disabled={isLoading}
                    className="h-10 w-10 rounded-full flex items-center justify-center text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: config.primaryColor }}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!needsInfo) setStep("chat");
        }}
        className="h-14 w-14 rounded-full flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105"
        style={{ background: config.primaryColor, boxShadow: `0 4px 20px ${config.primaryColor}40` }}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </button>
    </div>
  );
};

export default ChatWidgetPreview;
