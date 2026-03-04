import { useState, useEffect, useRef } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useHandoffEvents, useMessages } from "@/hooks/use-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock,
  Send,
  User,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const priorityColors: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  normal: "bg-warning/10 text-warning",
  low: "bg-muted text-muted-foreground",
};

const statusIcons: Record<string, typeof Clock> = {
  pending: Clock,
  assigned: ArrowUpRight,
  resolved: CheckCircle2,
};

const HandoffQueue = () => {
  const { data: handoffs, refetch: refetchHandoffs } = useHandoffEvents();
  const [selectedHandoff, setSelectedHandoff] = useState<string | null>(null);
  const [inputMsg, setInputMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "assigned" | "resolved">("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = handoffs?.find((h) => h.id === selectedHandoff);
  const conversationId = selected?.conversation_id;
  const { data: messages, refetch: refetchMessages } = useMessages(conversationId || "");

  // Auto-select first handoff
  useEffect(() => {
    if (handoffs?.length && !selectedHandoff) {
      setSelectedHandoff(handoffs[0].id);
    }
  }, [handoffs, selectedHandoff]);

  // Realtime for new handoff events
  useEffect(() => {
    const channel = supabase
      .channel("handoff-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "handoff_events" }, () => {
        refetchHandoffs();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetchHandoffs]);

  // Realtime for messages in selected conversation
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`msgs-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => {
        refetchMessages();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, refetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendManualReply = async () => {
    if (!inputMsg.trim() || !conversationId) return;
    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "bot",
        content: inputMsg,
        metadata: { manual_reply: true } as any,
      });
      if (error) throw error;
      setInputMsg("");
      refetchMessages();
    } catch (err) {
      toast.error("Gửi tin nhắn thất bại");
    } finally {
      setSending(false);
    }
  };

  const resolveHandoff = async (handoffId: string) => {
    const { error } = await supabase
      .from("handoff_events")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", handoffId);
    if (error) {
      toast.error("Không thể resolve");
    } else {
      toast.success("Đã resolve handoff");
      refetchHandoffs();
    }
  };

  const filteredHandoffs = handoffs?.filter((h) => filter === "all" || h.status === filter) || [];

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-4rem)] -m-8 animate-slide-in">
        {/* Queue list */}
        <div className="w-80 border-r flex flex-col bg-card">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h2 className="text-base font-semibold">Handoff Queue</h2>
              {handoffs?.filter((h) => h.status === "pending").length ? (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                  {handoffs.filter((h) => h.status === "pending").length}
                </span>
              ) : null}
            </div>
            <div className="flex gap-1.5">
              {(["all", "pending", "assigned", "resolved"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                    filter === f
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground hover:bg-primary/5"
                  }`}
                >
                  {f === "all" ? "Tất cả" : f === "pending" ? "Chờ" : f === "assigned" ? "Đã nhận" : "Resolved"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y">
            {filteredHandoffs.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Không có handoff nào
              </div>
            )}
            {filteredHandoffs.map((h) => {
              const StatusIcon = statusIcons[h.status] || Clock;
              return (
                <button
                  key={h.id}
                  onClick={() => setSelectedHandoff(h.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors ${
                    selectedHandoff === h.id ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <StatusIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityColors[h.priority]}`}>
                          {h.priority}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(h.created_at), "HH:mm")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{h.reason}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono truncate">
                        {h.conversation_id.slice(0, 8)}...
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {selected ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between border-b px-6 py-3.5 bg-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/10">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Handoff #{selected.id.slice(0, 8)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {selected.reason} · {selected.priority} priority
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={selected.status === "pending" ? "destructive" : selected.status === "resolved" ? "secondary" : "default"}>
                    {selected.status}
                  </Badge>
                  {selected.status !== "resolved" && (
                    <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => resolveHandoff(selected.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Resolve
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages */}
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

              {/* Manual reply input */}
              {selected.status !== "resolved" && (
                <div className="border-t p-4 bg-card">
                  <div className="flex items-center gap-3">
                    <Input
                      value={inputMsg}
                      onChange={(e) => setInputMsg(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendManualReply()}
                      placeholder="Trả lời thủ công cho khách hàng..."
                      className="flex-1 h-10"
                      disabled={sending}
                    />
                    <Button size="icon" className="shrink-0 h-9 w-9 glow-primary" onClick={sendManualReply} disabled={sending || !inputMsg.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Chọn một handoff để xem chi tiết</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default HandoffQueue;
