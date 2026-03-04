import { useState } from "react";
import { MessageSquare, X, Send, Minus, Loader2 } from "lucide-react";
import { sendChatMessage, uploadChatAttachment, extractFileContent } from "@/lib/api";
import { ChatMessageRenderer } from "@/components/chat/ChatMessageRenderer";
import { ChatFileUpload, type ChatAttachment } from "@/components/chat/ChatFileUpload";
import { toast } from "sonner";

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
  imageUrls?: string[];
}

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
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);

  const needsInfo = config.collectName || config.collectEmail || config.collectPhone;
  const now = () => new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;
    const msgText = input;
    const msgAttachments = [...attachments];

    // Show user message immediately with image previews
    const imagePreviewUrls = msgAttachments
      .filter((a) => a.type === "image" && a.preview)
      .map((a) => a.preview!);

    const userMsg: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: msgText || `📎 ${msgAttachments.map((a) => a.file.name).join(", ")}`,
      time: now(),
      imageUrls: imagePreviewUrls,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);

    try {
      // 1. Upload files to storage
      let processedAttachments: Array<{ url: string; type: string; content?: string; strategy?: string }> = [];

      if (msgAttachments.length > 0) {
        const uploadedUrls: string[] = [];
        for (const att of msgAttachments) {
          try {
            const url = await uploadChatAttachment(att.file, config.tenantId);
            uploadedUrls.push(url);
          } catch (err) {
            console.error("Upload failed:", err);
            toast.error(`Upload thất bại: ${att.file.name}`);
          }
        }

        // 2. Extract content from uploaded files
        if (uploadedUrls.length > 0) {
          try {
            const extracted = await extractFileContent(uploadedUrls, config.tenantId);
            processedAttachments = extracted.results.map((r) => ({
              url: r.url,
              type: r.type,
              content: r.content,
              strategy: r.strategy,
            }));
          } catch (err) {
            console.error("Extraction failed:", err);
            // Still send with file URLs as fallback
            processedAttachments = uploadedUrls.map((url) => ({ url, type: "unknown" }));
          }
        }
      }

      // 3. Send to chat with attachment context
      const result = await sendChatMessage({
        tenantId: config.tenantId,
        message: msgText,
        conversationId,
        endUser: { name: userInfo.name, email: userInfo.email, phone: userInfo.phone },
        attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
      });

      if (result.conversation_id) setConversationId(result.conversation_id);
      setMessages((prev) => [...prev, {
        id: Date.now() + 1, role: "bot", content: result.response, time: now(),
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: Date.now() + 1, role: "bot", content: "Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.", time: now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`fixed bottom-6 z-50 ${config.position === "bottom-right" ? "right-6" : "left-6"}`}>
      {isOpen && (
        <div className="mb-4 w-[380px] rounded-2xl bg-card border shadow-lg overflow-hidden animate-slide-in"
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

          {/* Info collection */}
          {step === "info" && needsInfo ? (
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">Vui lòng cung cấp thông tin để bắt đầu chat:</p>
              {config.collectName && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Họ tên</label>
                  <input value={userInfo.name} onChange={(e) => setUserInfo({ ...userInfo, name: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Nguyễn Văn A" />
                </div>
              )}
              {config.collectEmail && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Email</label>
                  <input value={userInfo.email} onChange={(e) => setUserInfo({ ...userInfo, email: e.target.value })}
                    type="email" className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="email@company.com" />
                </div>
              )}
              {config.collectPhone && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Số điện thoại</label>
                  <input value={userInfo.phone} onChange={(e) => setUserInfo({ ...userInfo, phone: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="0912 345 678" />
                </div>
              )}
              <button onClick={() => setStep("chat")}
                className="w-full rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: config.primaryColor }}>
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
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                        msg.role === "user" ? "rounded-br-md text-white" : "chat-bubble-bot"
                      }`}
                      style={msg.role === "user" ? { background: config.primaryColor } : undefined}
                    >
                      {/* Image previews for user messages */}
                      {msg.imageUrls?.map((url, i) => (
                        <img key={i} src={url} alt="" className="rounded-lg max-w-full max-h-32 border border-white/20 mb-2" />
                      ))}
                      <ChatMessageRenderer content={msg.content} role={msg.role} />
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
                {/* Attachment previews */}
                {attachments.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-2 px-1">
                    {attachments.map((att, i) => (
                      <div key={i} className="relative group">
                        {att.type === "image" && att.preview ? (
                          <img src={att.preview} alt="" className="h-12 w-12 rounded-lg object-cover border" />
                        ) : (
                          <div className="h-12 rounded-lg border bg-muted/50 flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground max-w-[120px]">
                            <span className="truncate">{att.file.name}</span>
                          </div>
                        )}
                        <button onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <ChatFileUpload
                    attachments={[]} // previews handled above
                    onAdd={(a) => setAttachments((prev) => [...prev, a])}
                    onRemove={() => {}}
                    disabled={isLoading}
                  />
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder={config.placeholder}
                    disabled={isLoading}
                    className="flex-1 rounded-full border px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  />
                  <button onClick={handleSend} disabled={isLoading}
                    className="h-10 w-10 rounded-full flex items-center justify-center text-white transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0"
                    style={{ background: config.primaryColor }}>
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
        onClick={() => { setIsOpen(!isOpen); if (!needsInfo) setStep("chat"); }}
        className="h-14 w-14 rounded-full flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105"
        style={{ background: config.primaryColor, boxShadow: `0 4px 20px ${config.primaryColor}40` }}>
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </button>
    </div>
  );
};

export default ChatWidgetPreview;
