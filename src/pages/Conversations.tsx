import { useState, useEffect, useRef } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Search, Send, Bot, User, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useConversations, useMessages } from "@/hooks/use-data";
import { useRealtimeConversations, useRealtimeMessages } from "@/hooks/use-realtime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  active: "bg-success",
  resolved: "bg-muted-foreground",
  handoff: "bg-warning",
};

const Conversations = () => {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [inputMsg, setInputMsg] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "handoff">("all");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useConversations();
  const { data: messages, refetch: refetchMessages } = useMessages(selectedConvId || "");

  // Enable realtime
  useRealtimeConversations();
  useRealtimeMessages(selectedConvId || undefined);

  // Auto-select first
  useEffect(() => {
    if (conversations?.length && !selectedConvId) {
      setSelectedConvId(conversations[0].id);
    }
  }, [conversations, selectedConvId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filtered = conversations?.filter((c) => filter === "all" || c.status === filter) || [];
  const selectedConv = conversations?.find((c) => c.id === selectedConvId);

  const sendManualReply = async () => {
    if (!inputMsg.trim() || !selectedConvId) return;
    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: selectedConvId,
        role: "bot",
        content: inputMsg,
        metadata: { manual_reply: true } as any,
      });
      if (error) throw error;
      setInputMsg("");
      refetchMessages();
    } catch {
      toast.error("Gửi tin nhắn thất bại");
    } finally {
      setSending(false);
    }
  };

  const handleHandoff = async () => {
    if (!selectedConvId || !selectedConv) return;
    const { error } = await supabase.from("handoff_events").insert({
      conversation_id: selectedConvId,
      tenant_id: selectedConv.tenant_id,
      reason: "Manual escalation from conversation view",
      priority: "normal",
    });
    if (!error) {
      await supabase.from("conversations").update({ status: "handoff" }).eq("id", selectedConvId);
      toast.success("Đã chuyển sang Handoff Queue");
    }
  };

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-4rem)] -m-8 animate-slide-in">
        {/* Conversation list */}
        <div className="w-80 border-r flex flex-col bg-card">
          <div className="p-4 border-b space-y-3">
            <h2 className="text-base font-semibold">Hội thoại</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm kiếm..." className="pl-9 h-9 text-sm" />
            </div>
            <div className="flex gap-1.5">
              {([["all", "Tất cả"], ["active", "Đang xử lý"], ["handoff", "Handoff"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                    filter === key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:bg-primary/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y">
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">Không có hội thoại</div>
            )}
            {filtered.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={`w-full text-left px-4 py-3.5 transition-colors ${
                  selectedConvId === conv.id ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                      {(conv.end_user_name || "?").charAt(0)}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${statusColors[conv.status] || "bg-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{conv.end_user_name || conv.end_user_email || "Ẩn danh"}</p>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(conv.updated_at), "HH:mm")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {conv.intent || conv.id.slice(0, 8)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {selectedConv ? (
            <>
              <div className="flex items-center justify-between border-b px-6 py-3.5 bg-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted font-semibold text-sm">
                    {(selectedConv.end_user_name || "?").charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{selectedConv.end_user_name || "Ẩn danh"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedConv.end_user_email || ""} · {selectedConv.intent || "—"} · conf: {selectedConv.confidence?.toFixed(2) || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={handleHandoff}>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    Handoff
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages?.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role !== "user" && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-1">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-bot"}>
                      <p className="text-sm whitespace-pre-line">{msg.content}</p>
                      <div className={`flex items-center gap-2 mt-2 text-[10px] ${msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        <span>{format(new Date(msg.created_at), "HH:mm")}</span>
                        {msg.confidence && (
                          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                            conf: {msg.confidence}
                          </span>
                        )}
                        {msg.tool_used && (
                          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                            🔧 {msg.tool_used}
                          </span>
                        )}
                        {(msg.metadata as any)?.manual_reply && (
                          <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning font-mono">
                            👤 manual
                          </span>
                        )}
                      </div>
                      {msg.sources && Array.isArray(msg.sources) && (msg.sources as string[]).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/50">
                          <p className="text-[10px] text-muted-foreground">📚 Sources: {(msg.sources as string[]).join(", ")}</p>
                        </div>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary mt-1">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t p-4 bg-card">
                <div className="flex items-center gap-3">
                  <Input
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendManualReply()}
                    placeholder="Nhập tin nhắn hoặc trả lời thủ công..."
                    className="flex-1 h-10"
                    disabled={sending}
                  />
                  <Button size="icon" className="shrink-0 h-9 w-9 glow-primary" onClick={sendManualReply} disabled={sending || !inputMsg.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Chọn hội thoại để xem chi tiết
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default Conversations;
