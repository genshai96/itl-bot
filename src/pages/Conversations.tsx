import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Search, Filter, Send, Paperclip, Bot, User, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const conversations = [
  { id: 1, user: "Nguyễn Văn A", lastMsg: "Làm sao để xuất báo cáo công nợ?", status: "active", time: "2m", unread: true },
  { id: 2, user: "Trần Thị B", lastMsg: "Cảm ơn bạn, mình hiểu rồi.", status: "resolved", time: "15m", unread: false },
  { id: 3, user: "Lê Văn C", lastMsg: "Vẫn không đăng nhập được...", status: "handoff", time: "32m", unread: true },
  { id: 4, user: "Phạm Thị D", lastMsg: "Tra cứu doanh số sales An Nguyên", status: "active", time: "1h", unread: false },
  { id: 5, user: "Hoàng Minh E", lastMsg: "Tạo hợp đồng mới thế nào?", status: "active", time: "2h", unread: false },
];

const chatMessages = [
  { id: 1, role: "user" as const, content: "Làm sao để xuất báo cáo công nợ tháng 2?", time: "14:23" },
  { id: 2, role: "bot" as const, content: "Để xuất báo cáo công nợ tháng 2, bạn thực hiện các bước sau:\n\n1. Vào menu **Kế toán** → **Công nợ**\n2. Chọn **Kỳ báo cáo**: Tháng 2/2026\n3. Nhấn nút **Xuất Excel** ở góc phải\n\n📎 Tham khảo thêm: [Hướng dẫn xuất báo cáo](https://docs.example.com/bao-cao)", time: "14:23", confidence: 0.92, sources: ["KB-001: Hướng dẫn công nợ"] },
  { id: 3, role: "user" as const, content: "Cho mình xem công nợ tháng 2 của khách hàng ABC Corp", time: "14:25" },
  { id: 4, role: "bot" as const, content: "🔍 Đang tra cứu công nợ...\n\n**Kết quả công nợ tháng 2/2026 - ABC Corp:**\n\n| Hạng mục | Số tiền |\n|---|---|\n| Dư đầu kỳ | 150,000,000₫ |\n| Phát sinh | 85,000,000₫ |\n| Thu trong kỳ | 120,000,000₫ |\n| **Dư cuối kỳ** | **115,000,000₫** |\n\n⚙️ Tool: `check_receivable_by_month` | Latency: 1.2s", time: "14:25", confidence: 0.97, toolUsed: "check_receivable_by_month" },
];

const statusColors: Record<string, string> = {
  active: "bg-success",
  resolved: "bg-muted-foreground",
  handoff: "bg-warning",
};

const Conversations = () => {
  const [selectedConv, setSelectedConv] = useState(1);
  const [inputMsg, setInputMsg] = useState("");

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
              {["Tất cả", "Đang xử lý", "Handoff"].map((f) => (
                <button key={f} className="rounded-full px-3 py-1 text-[11px] font-medium bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv.id)}
                className={`w-full text-left px-4 py-3.5 transition-colors ${
                  selectedConv === conv.id ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                      {conv.user.charAt(0)}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${statusColors[conv.status]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm truncate ${conv.unread ? "font-semibold" : "font-medium"}`}>{conv.user}</p>
                      <span className="text-[10px] text-muted-foreground">{conv.time}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMsg}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {/* Chat header */}
          <div className="flex items-center justify-between border-b px-6 py-3.5 bg-card">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted font-semibold text-sm">N</div>
              <div>
                <p className="text-sm font-semibold">Nguyễn Văn A</p>
                <p className="text-[11px] text-muted-foreground">Acme Corp · how_to_use · conf: 0.92</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs gap-1.5">
                <ArrowUpRight className="h-3.5 w-3.5" />
                Handoff
              </Button>
              <Button variant="outline" size="sm" className="text-xs">Gắn nhãn</Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "bot" && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-1">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-bot"}>
                  <p className="text-sm whitespace-pre-line">{msg.content}</p>
                  <div className={`flex items-center gap-2 mt-2 text-[10px] ${msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    <span>{msg.time}</span>
                    {msg.role === "bot" && "confidence" in msg && (
                      <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                        conf: {msg.confidence}
                      </span>
                    )}
                    {msg.role === "bot" && "toolUsed" in msg && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                        🔧 {msg.toolUsed}
                      </span>
                    )}
                  </div>
                  {msg.role === "bot" && "sources" in msg && msg.sources && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <p className="text-[10px] text-muted-foreground">📚 Sources: {msg.sources.join(", ")}</p>
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
          </div>

          {/* Input */}
          <div className="border-t p-4 bg-card">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 text-muted-foreground">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                placeholder="Nhập tin nhắn hoặc trả lời thủ công..."
                className="flex-1 h-10"
              />
              <Button size="icon" className="shrink-0 h-9 w-9 glow-primary">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default Conversations;
