import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BookmarkPlus, Loader2, Database } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface IngestConversationButtonProps {
  conversationId: string;
  tenantId: string;
  messages: Message[];
}

export const IngestConversationButton = ({
  conversationId,
  tenantId,
  messages,
}: IngestConversationButtonProps) => {
  const [open, setOpen] = useState(false);
  const [selectedPairs, setSelectedPairs] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  // Extract Q&A pairs
  const qaPairs = messages.reduce<Array<{ question: string; answer: string; index: number }>>((acc, msg, i) => {
    if (msg.role === "user" && i + 1 < messages.length && messages[i + 1].role !== "user") {
      acc.push({
        question: msg.content,
        answer: messages[i + 1].content,
        index: acc.length,
      });
    }
    return acc;
  }, []);

  const togglePair = (index: number) => {
    const next = new Set(selectedPairs);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedPairs(next);
  };

  const selectAll = () => {
    if (selectedPairs.size === qaPairs.length) {
      setSelectedPairs(new Set());
    } else {
      setSelectedPairs(new Set(qaPairs.map((_, i) => i)));
    }
  };

  const ingest = async () => {
    if (selectedPairs.size === 0) return;
    setSaving(true);
    try {
      const selected = qaPairs.filter((_, i) => selectedPairs.has(i));
      const content = selected
        .map((p) => `Q: ${p.question}\nA: ${p.answer}`)
        .join("\n\n---\n\n");

      // Create KB document
      const { data: doc, error: docErr } = await supabase
        .from("kb_documents")
        .insert({
          tenant_id: tenantId,
          name: `Conversation ${conversationId.slice(0, 8)} — ${selected.length} Q&A pairs`,
          status: "ready",
          metadata: { source: "conversation", conversation_id: conversationId },
          chunk_count: selected.length,
        })
        .select()
        .single();
      if (docErr) throw docErr;

      // Create chunks for each Q&A pair
      const chunks = selected.map((p, i) => ({
        tenant_id: tenantId,
        document_id: doc.id,
        content: `Q: ${p.question}\nA: ${p.answer}`,
        chunk_index: i,
        metadata: { source: "conversation", conversation_id: conversationId },
      }));

      const { error: chunkErr } = await supabase.from("kb_chunks").insert(chunks);
      if (chunkErr) throw chunkErr;

      toast.success(`Đã lưu ${selected.length} Q&A pairs vào Knowledge Base`);
      setOpen(false);
      setSelectedPairs(new Set());
    } catch (err: any) {
      toast.error(err.message || "Lỗi ingest");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs gap-1.5">
          <Database className="h-3.5 w-3.5" />
          Save to KB
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus className="h-5 w-5 text-primary" />
            Lưu Q&A vào Knowledge Base
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Chọn các cặp hỏi-đáp để lưu vào Knowledge Base. Bot sẽ sử dụng RAG để tìm lại khi gặp câu hỏi tương tự.
        </p>

        {qaPairs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Không tìm thấy cặp Q&A nào trong hội thoại này
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button onClick={selectAll} className="text-xs text-primary hover:underline">
                {selectedPairs.size === qaPairs.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
              </button>
              <span className="text-xs text-muted-foreground">
                Đã chọn {selectedPairs.size}/{qaPairs.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px]">
              {qaPairs.map((pair, i) => (
                <label
                  key={i}
                  className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedPairs.has(i) ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <Checkbox
                    checked={selectedPairs.has(i)}
                    onCheckedChange={() => togglePair(i)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-primary line-clamp-2">Q: {pair.question}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-3">A: {pair.answer}</p>
                  </div>
                </label>
              ))}
            </div>
            <Button
              className="w-full gap-2"
              onClick={ingest}
              disabled={saving || selectedPairs.size === 0}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Lưu {selectedPairs.size} cặp Q&A vào KB
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
