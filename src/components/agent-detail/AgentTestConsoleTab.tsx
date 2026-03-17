import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatMessageRenderer } from "@/components/chat/ChatMessageRenderer";
import { ChatFileUpload, type ChatAttachment } from "@/components/chat/ChatFileUpload";
import { Bot, FileText, Loader2, MessageSquare, Send, User } from "lucide-react";
import type { RefObject } from "react";

interface TestMessage {
  role: string;
  content: string;
  imageUrls?: string[];
}

interface AgentTestConsoleTabProps {
  tenantName: string;
  testConvId?: string;
  testMessages: TestMessage[];
  testSending: boolean;
  testEndRef: RefObject<HTMLDivElement>;
  testAttachments: ChatAttachment[];
  setTestAttachments: (value: ChatAttachment[] | ((prev: ChatAttachment[]) => ChatAttachment[])) => void;
  testInput: string;
  setTestInput: (value: string) => void;
  onSend: () => void;
  onReset: () => void;
}

export const AgentTestConsoleTab = ({
  tenantName,
  testConvId,
  testMessages,
  testSending,
  testEndRef,
  testAttachments,
  setTestAttachments,
  testInput,
  setTestInput,
  onSend,
  onReset,
}: AgentTestConsoleTabProps) => {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><MessageSquare className="h-5 w-5 text-primary" /></div>
          <div>
            <h3 className="text-sm font-semibold">Test Conversation — {tenantName}</h3>
            <p className="text-xs text-muted-foreground">Gửi tin nhắn thử để test AI bot response</p>
          </div>
          {testConvId && (
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">conv: {testConvId.slice(0, 8)}...</span>
          )}
          <Button variant="outline" size="sm" className="text-xs" onClick={onReset}>
            Reset
          </Button>
        </div>
        <div className="h-80 overflow-y-auto p-6 space-y-4">
          {testMessages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              Gửi tin nhắn đầu tiên để bắt đầu test
            </div>
          )}
          {testMessages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
              {msg.role !== "user" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-1">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-bot"}>
                {msg.imageUrls?.map((url, j) => (
                  <img key={j} src={url} alt="" className="rounded-lg max-w-full max-h-32 mb-2 border" />
                ))}
                <ChatMessageRenderer content={msg.content} role={msg.role === "bot" ? "bot" : "user"} />
              </div>
              {msg.role === "user" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary mt-1">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}
          {testSending && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-1">
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              </div>
              <div className="chat-bubble-bot">
                <p className="text-sm text-muted-foreground">Đang trả lời...</p>
              </div>
            </div>
          )}
          <div ref={testEndRef} />
        </div>
        <div className="border-t p-4">
          {testAttachments.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {testAttachments.map((att, i) => (
                <div key={i} className="relative group">
                  {att.type === "image" && att.preview ? (
                    <img src={att.preview} alt="" className="h-12 w-12 rounded-lg object-cover border" />
                  ) : (
                    <div className="h-12 rounded-lg border bg-muted/50 flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground max-w-[120px]">
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate">{att.file.name}</span>
                    </div>
                  )}
                  <button onClick={() => setTestAttachments((prev) => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <ChatFileUpload attachments={[]} onAdd={(a) => setTestAttachments((prev) => [...prev, a])} onRemove={() => {}} disabled={testSending} />
            <Input value={testInput} onChange={(e) => setTestInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSend()} placeholder="Nhập tin nhắn test..." className="flex-1 h-10" disabled={testSending} />
            <Button size="icon" className="shrink-0 h-9 w-9 glow-primary" onClick={onSend} disabled={testSending || (!testInput.trim() && testAttachments.length === 0)}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
