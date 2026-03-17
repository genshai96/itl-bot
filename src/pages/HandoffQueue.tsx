import { useState, useEffect, useRef } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useHandoffEvents, useMessages, type HandoffEvent } from "@/hooks/use-data";
import { useHighestRole, useCurrentUserRoles } from "@/hooks/use-current-roles";
import { useRealtimeHandoffs, useRealtimeMessages } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AgentAssignSelect } from "@/components/handoff/AgentAssignSelect";
import { SlaTimer } from "@/components/handoff/SlaTimer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock,
  Send,
  User,
  AlertTriangle,
  MessageSquare,
  UserCircle,
  Lock,
  RotateCcw,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Constants ────────────────────────────────────────────────────────────────

const priorityColors: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  normal: "bg-warning/10 text-warning",
  low: "bg-muted text-muted-foreground",
};

const statusIcons: Record<string, React.ElementType> = {
  pending: Clock,
  assigned: ArrowUpRight,
  resolved: CheckCircle2,
};

const SLA_PRESETS = [
  { label: "15 phút", ms: 15 * 60 * 1000 },
  { label: "30 phút", ms: 30 * 60 * 1000 },
  { label: "1 giờ",   ms: 60 * 60 * 1000 },
  { label: "2 giờ",   ms: 2 * 60 * 60 * 1000 },
];

// ── Component ─────────────────────────────────────────────────────────────────

const HandoffQueue = () => {
  const { user } = useAuth();
  const highestRole = useHighestRole();
  const { data: userRoles } = useCurrentUserRoles();

  // System admin sees all tenants; support agents see only their own tenant
  const tenantIdFilter =
    highestRole === "system_admin"
      ? undefined
      : (userRoles?.find((r) => r.tenant_id)?.tenant_id ?? undefined);

  const { data: handoffs, refetch: refetchHandoffs } = useHandoffEvents(tenantIdFilter);

  const [selectedHandoff, setSelectedHandoff] = useState<string | null>(null);
  const [inputMsg, setInputMsg] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "assigned" | "resolved">("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [slaPopoverOpen, setSlaPopoverOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected: HandoffEvent | undefined = handoffs?.find((h) => h.id === selectedHandoff);
  const conversationId = selected?.conversation_id;
  const { data: messages, refetch: refetchMessages } = useMessages(conversationId ?? "");

  // ── Centralized realtime (replaces inline duplicate channels) ─────────────
  useRealtimeHandoffs();
  useRealtimeMessages(conversationId);

  // Auto-select first item in list
  useEffect(() => {
    if (handoffs?.length && !selectedHandoff) {
      setSelectedHandoff(handoffs[0].id);
    }
  }, [handoffs, selectedHandoff]);

  // Scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const sendManualReply = async () => {
    if (!inputMsg.trim() || !conversationId || !selected) return;
    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "bot",
        content: inputMsg,
        metadata: {
          manual_reply: true,
          is_internal: isInternal,
          sent_by: user?.id,
        } as any,
      });
      if (error) throw error;

      // FIX: Track first response time for customer-facing replies
      if (!isInternal && !selected.first_response_at) {
        await supabase
          .from("handoff_events")
          .update({ first_response_at: new Date().toISOString() })
          .eq("id", selected.id);
      }

      setInputMsg("");
      refetchMessages();
      refetchHandoffs();
    } catch {
      toast.error("Gửi tin nhắn thất bại");
    } finally {
      setSending(false);
    }
  };

  const resolveHandoff = async () => {
    if (!selected) return;
    const { error } = await supabase
      .from("handoff_events")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", selected.id);
    if (error) { toast.error("Không thể resolve"); return; }
    await supabase.from("conversations").update({ status: "resolved" }).eq("id", conversationId);
    toast.success("Đã resolve handoff");
    refetchHandoffs();
  };

  // FIX: Re-open a resolved handoff
  const reopenHandoff = async () => {
    if (!selected) return;
    const newStatus = selected.assigned_to ? "assigned" : "pending";
    const { error } = await supabase
      .from("handoff_events")
      .update({ status: newStatus, resolved_at: null })
      .eq("id", selected.id);
    if (error) { toast.error("Không thể reopen"); return; }
    await supabase.from("conversations").update({ status: "active" }).eq("id", conversationId);
    toast.success("Đã reopen handoff");
    refetchHandoffs();
  };

  // FIX: Allow changing priority inline
  const changePriority = async (priority: string) => {
    if (!selected) return;
    const { error } = await supabase
      .from("handoff_events")
      .update({ priority })
      .eq("id", selected.id);
    if (error) { toast.error("Không thể đổi priority"); return; }
    toast.success(`Priority → ${priority}`);
    refetchHandoffs();
  };

  // FIX: Set SLA deadline (previously never set)
  const setSlaDeadline = async (ms: number) => {
    if (!selected) return;
    const deadline = new Date(Date.now() + ms).toISOString();
    const { error } = await supabase
      .from("handoff_events")
      .update({ sla_deadline_at: deadline })
      .eq("id", selected.id);
    if (error) { toast.error("Không thể set SLA"); return; }
    toast.success("Đã set SLA deadline");
    setSlaPopoverOpen(false);
    refetchHandoffs();
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  const filteredHandoffs = (handoffs ?? []).filter((h) => {
    if (filter !== "all" && h.status !== filter) return false;
    if (onlyMine && h.assigned_to !== user?.id) return false;
    return true;
  });

  const pendingCount = handoffs?.filter((h) => h.status === "pending").length ?? 0;
  const assignedToMeCount =
    handoffs?.filter((h) => h.assigned_to === user?.id && h.status !== "resolved").length ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-4rem)] -m-8 animate-slide-in">

        {/* ── Queue List ──────────────────────────────────────────────── */}
        <div className="w-80 border-r flex flex-col bg-card shrink-0">

          {/* Header + filters */}
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h2 className="text-base font-semibold">Handoff Queue</h2>
              {pendingCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground px-1">
                  {pendingCount}
                </span>
              )}
            </div>

            <div className="flex gap-1.5 flex-wrap">
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

            <div className="flex items-center gap-2">
              <Switch
                id="only-mine"
                checked={onlyMine}
                onCheckedChange={setOnlyMine}
                className="scale-[0.7]"
              />
              <Label htmlFor="only-mine" className="text-[11px] text-muted-foreground cursor-pointer">
                Chỉ của tôi ({assignedToMeCount})
              </Label>
            </div>
          </div>

          {/* Queue items */}
          <div className="flex-1 overflow-y-auto divide-y">
            {filteredHandoffs.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Không có handoff nào
              </div>
            )}
            {filteredHandoffs.map((h) => {
              const StatusIcon = statusIcons[h.status] ?? Clock;
              return (
                <button
                  key={h.id}
                  onClick={() => setSelectedHandoff(h.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors ${
                    selectedHandoff === h.id
                      ? "bg-primary/5 border-l-2 border-l-primary"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <StatusIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityColors[h.priority] ?? ""}`}>
                          {h.priority}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(h.created_at), "HH:mm")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{h.reason}</p>

                      {/* FIX: No more `as any` — fields are properly typed */}
                      <div className="mt-1">
                        <SlaTimer
                          createdAt={h.created_at}
                          slaDeadlineAt={h.sla_deadline_at}
                          firstResponseAt={h.first_response_at}
                          resolvedAt={h.resolved_at}
                          compact
                        />
                      </div>

                      {h.assigned_to && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-info">
                          <UserCircle className="h-3 w-3" />
                          <span>{h.assigned_to === user?.id ? "Assigned to me" : "Assigned"}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Chat Area ───────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between border-b px-6 py-3 bg-card flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/10 shrink-0">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Handoff #{selected.id.slice(0, 8)}</p>
                    <p className="text-[11px] text-muted-foreground">{selected.reason}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* SLA live timer */}
                  <SlaTimer
                    createdAt={selected.created_at}
                    slaDeadlineAt={selected.sla_deadline_at}
                    firstResponseAt={selected.first_response_at}
                    resolvedAt={selected.resolved_at}
                  />

                  {/* FIX: SLA deadline setter (was never available before) */}
                  {selected.status !== "resolved" && (
                    <Popover open={slaPopoverOpen} onOpenChange={setSlaPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 px-2">
                          <Timer className="h-3.5 w-3.5" />
                          {selected.sla_deadline_at ? "SLA ✓" : "Set SLA"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-44 p-1" align="end">
                        <p className="text-[10px] text-muted-foreground px-2 py-1 font-medium">
                          Deadline từ bây giờ
                        </p>
                        {SLA_PRESETS.map((preset) => (
                          <button
                            key={preset.ms}
                            onClick={() => setSlaDeadline(preset.ms)}
                            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}

                  {/* FIX: Priority editable (was display-only) */}
                  {selected.status !== "resolved" && (
                    <Select value={selected.priority} onValueChange={changePriority}>
                      <SelectTrigger className="h-8 w-28 text-xs gap-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high" className="text-xs">🔴 High</SelectItem>
                        <SelectItem value="normal" className="text-xs">🟡 Normal</SelectItem>
                        <SelectItem value="low" className="text-xs">🟢 Low</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {/* Assign agent */}
                  {selected.status !== "resolved" && (
                    <AgentAssignSelect
                      handoffId={selected.id}
                      tenantId={selected.tenant_id}
                      currentAssignee={selected.assigned_to}
                      onAssigned={refetchHandoffs}
                    />
                  )}

                  <Badge
                    variant={
                      selected.status === "pending"
                        ? "destructive"
                        : selected.status === "resolved"
                        ? "secondary"
                        : "default"
                    }
                  >
                    {selected.status}
                  </Badge>

                  {/* FIX: Resolve / Reopen toggle */}
                  {selected.status !== "resolved" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                      onClick={resolveHandoff}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Resolve
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                      onClick={reopenHandoff}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reopen
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages?.map((msg) => {
                  const meta = msg.metadata as Record<string, any> | null;
                  const isInternalMsg = meta?.is_internal === true;

                  // Internal note: displayed as a centered dashed card, not visible to customer
                  if (isInternalMsg) {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <div className="bg-muted/50 border border-dashed border-muted-foreground/30 rounded-lg px-4 py-2 max-w-lg w-full">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Lock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground font-medium">Internal Note</span>
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {format(new Date(msg.created_at), "HH:mm")}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-pre-line">{msg.content}</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                      {msg.role !== "user" && (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-1">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-bot"}>
                        <p className="text-sm whitespace-pre-line">{msg.content}</p>
                        <div
                          className={`flex items-center gap-2 mt-2 text-[10px] ${
                            msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"
                          }`}
                        >
                          <span>{format(new Date(msg.created_at), "HH:mm")}</span>
                          {msg.tool_used && (
                            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                              🔧 {msg.tool_used}
                            </span>
                          )}
                          {meta?.manual_reply && (
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
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              {selected.status !== "resolved" && (
                <div className="border-t p-4 bg-card space-y-2">
                  {/* FIX: Reply vs Internal Note toggle */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsInternal(false)}
                      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                        !isInternal
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <MessageSquare className="h-3 w-3" />
                      Trả lời khách
                    </button>
                    <button
                      onClick={() => setIsInternal(true)}
                      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                        isInternal
                          ? "bg-muted border border-dashed border-muted-foreground/40 text-muted-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Lock className="h-3 w-3" />
                      Internal note
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <Input
                      value={inputMsg}
                      onChange={(e) => setInputMsg(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendManualReply()}
                      placeholder={
                        isInternal
                          ? "Ghi chú nội bộ (không gửi cho khách)..."
                          : "Trả lời thủ công cho khách hàng..."
                      }
                      className={`flex-1 h-10 ${isInternal ? "border-dashed" : ""}`}
                      disabled={sending}
                    />
                    <Button
                      size="icon"
                      className={`shrink-0 h-9 w-9 ${!isInternal ? "glow-primary" : ""}`}
                      variant={isInternal ? "outline" : "default"}
                      onClick={sendManualReply}
                      disabled={sending || !inputMsg.trim()}
                    >
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
