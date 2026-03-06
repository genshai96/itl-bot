import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MessageSquareWarning, Save, BookmarkPlus } from "lucide-react";
import { toast } from "sonner";

interface MessageCorrectionButtonProps {
  messageId: string;
  conversationId: string;
  tenantId: string;
  originalContent: string;
  userQuestion?: string;
}

export const MessageCorrectionButton = ({
  messageId,
  conversationId,
  tenantId,
  originalContent,
  userQuestion,
}: MessageCorrectionButtonProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [correction, setCorrection] = useState("");
  const [saving, setSaving] = useState(false);

  const saveCorrection = async () => {
    if (!correction.trim()) return;
    setSaving(true);
    try {
      const content = userQuestion
        ? `Câu hỏi: "${userQuestion}"\n\nBot đã trả lời sai: "${originalContent.slice(0, 200)}..."\n\nCâu trả lời đúng: ${correction}`
        : `Sửa lại câu trả lời: "${originalContent.slice(0, 200)}..."\n\nCâu trả lời đúng: ${correction}`;

      const { error } = await supabase.from("bot_memory").insert({
        tenant_id: tenantId,
        category: "correction",
        title: `Correction: ${(userQuestion || originalContent).slice(0, 60)}...`,
        content,
        source_conversation_id: conversationId,
        source_message_id: messageId,
        created_by: user?.id,
        enabled: true,
        priority: 5,
      });
      if (error) throw error;
      toast.success("Đã lưu correction vào bot memory");
      setCorrection("");
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Lỗi lưu correction");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-orange-500 transition-colors px-1.5 py-0.5 rounded hover:bg-orange-500/10"
          title="Sửa câu trả lời này"
        >
          <MessageSquareWarning className="h-3 w-3" />
          Sửa
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BookmarkPlus className="h-4 w-4 text-orange-500" />
            <p className="text-xs font-semibold">Thêm Correction</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Bot sẽ học từ correction này để trả lời tốt hơn lần sau.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Câu trả lời đúng</Label>
            <Textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="Nhập câu trả lời đúng thay thế..."
              rows={3}
              className="text-xs"
            />
          </div>
          <Button
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={saveCorrection}
            disabled={saving || !correction.trim()}
          >
            <Save className="h-3.5 w-3.5" />
            Lưu vào Memory
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
