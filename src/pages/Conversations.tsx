import { useState, useEffect, useRef, useMemo } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Search, Send, Bot, User, ArrowUpRight, Tag, X, Plus, Filter, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useConversations, useMessages } from "@/hooks/use-data";
import { useRealtimeConversations, useRealtimeMessages } from "@/hooks/use-realtime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isAfter, subDays } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCorrectionButton } from "@/components/chat/MessageCorrectionButton";
import { IngestConversationButton } from "@/components/chat/IngestConversationButton";

const statusColors: Record<string, string> = {
  active: "bg-success",
  resolved: "bg-muted-foreground",
  handoff: "bg-warning",
};

const Conversations = () => {
  const qc = useQueryClient();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [inputMsg, setInputMsg] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "handoff" | "resolved">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [sending, setSending] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useConversations();
  const { data: messages, refetch: refetchMessages } = useMessages(selectedConvId || "");

  useRealtimeConversations();
  useRealtimeMessages(selectedConvId || undefined);

  // Labels for selected conversation
  const { data: labels, refetch: refetchLabels } = useQuery({
    queryKey: ["conversation_labels", selectedConvId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_labels")
        .select("*")
        .eq("conversation_id", selectedConvId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedConvId,
  });

  const addLabel = useMutation({
    mutationFn: async (label: string) => {
      const { error } = await supabase.from("conversation_labels").insert({
        conversation_id: selectedConvId!,
        label,
        auto_labeled: false,
      });
      if (error) throw error;
    },
    onSuccess: () => { refetchLabels(); setNewLabel(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeLabel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("conversation_labels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refetchLabels(),
  });

  useEffect(() => {
    if (conversations?.length && !selectedConvId) {
      setSelectedConvId(conversations[0].id);
    }
  }, [conversations, selectedConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Filtered conversations
  const filtered = useMemo(() => {
    let list = conversations || [];
    if (filter !== "all") list = list.filter((c) => c.status === filter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((c) =>
        (c.end_user_name || "").toLowerCase().includes(s) ||
        (c.end_user_email || "").toLowerCase().includes(s) ||
        (c.intent || "").toLowerCase().includes(s) ||
        c.id.includes(s)
      );
    }
    if (dateFilter !== "all") {
      const days = parseInt(dateFilter);
      const cutoff = subDays(new Date(), days);
      list = list.filter((c) => isAfter(new Date(c.created_at), cutoff));
    }
    return list;
  }, [conversations, filter, searchTerm, dateFilter]);

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

  const resolveConversation = async () => {
    if (!selectedConvId) return;
    const { error } = await supabase.from("conversations").update({ status: "resolved" }).eq("id", selectedConvId);
    if (!error) toast.success("Đã đánh dấu resolved");
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
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo tên, email, intent..."
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {([["all", "Tất cả"], ["active", "Đang xử lý"], ["handoff", "Handoff"], ["resolved", "Resolved"]] as const).map(([key, label]) => (
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
            <div className="flex gap-1.5">
              {([["all", "Mọi lúc"], ["1", "Hôm nay"], ["7", "7 ngày"], ["30", "30 ngày"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDateFilter(key)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    dateFilter === key ? "bg-info/10 text-info" : "bg-muted text-muted-foreground hover:bg-info/5"
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
                  {selectedConv.status !== "resolved" && (
                    <Button variant="outline" size="sm" className="text-xs" onClick={resolveConversation}>
                      Resolve
                    </Button>
                  )}
                  {messages && messages.length > 0 && (
                    <IngestConversationButton
                      conversationId={selectedConv.id}
                      tenantId={selectedConv.tenant_id}
                      messages={messages}
                    />
                  )}
                  <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={handleHandoff}>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    Handoff
                  </Button>
                </div>
              </div>

              {/* Labels bar */}
              <div className="flex items-center gap-2 px-6 py-2 bg-muted/30 border-b flex-wrap">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                {labels?.map((l) => (
                  <Badge key={l.id} variant="secondary" className="text-[10px] gap-1 pr-1">
                    {l.label}
                    {!l.auto_labeled && (
                      <button onClick={() => removeLabel.mutate(l.id)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors">
                      <Plus className="h-3 w-3" />
                      Label
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2">
                    <div className="flex gap-1">
                      <Input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder="Tên label..."
                        className="h-7 text-xs"
                        onKeyDown={(e) => e.key === "Enter" && newLabel.trim() && addLabel.mutate(newLabel.trim())}
                      />
                      <Button size="sm" className="h-7 px-2" onClick={() => newLabel.trim() && addLabel.mutate(newLabel.trim())}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
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
                        {msg.role !== "user" && !(msg.metadata as any)?.manual_reply && selectedConv && (
                          <MessageCorrectionButton
                            messageId={msg.id}
                            conversationId={selectedConv.id}
                            tenantId={selectedConv.tenant_id}
                            originalContent={msg.content}
                            userQuestion={(() => {
                              const idx = messages?.findIndex((m) => m.id === msg.id) || 0;
                              const prev = messages?.[idx - 1];
                              return prev?.role === "user" ? prev.content : undefined;
                            })()}
                          />
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
