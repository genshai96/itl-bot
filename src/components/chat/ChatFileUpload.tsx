import { useRef, useState } from "react";
import { Paperclip, Image, File, X } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ChatAttachment {
  file: File;
  preview?: string;
  type: "image" | "file";
}

interface ChatFileUploadProps {
  attachments: ChatAttachment[];
  onAdd: (attachment: ChatAttachment) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}

export function ChatFileUpload({ attachments, onAdd, onRemove, disabled }: ChatFileUploadProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    onAdd({ file, preview, type: "image" });
    e.target.value = "";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onAdd({ file, type: "file" });
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      {attachments.length > 0 && (
        <div className="flex gap-2 flex-wrap px-1">
          {attachments.map((att, i) => (
            <div key={i} className="relative group">
              {att.type === "image" && att.preview ? (
                <img src={att.preview} alt="" className="h-14 w-14 rounded-lg object-cover border" />
              ) : (
                <div className="h-14 w-auto min-w-[56px] max-w-[140px] rounded-lg border bg-muted/50 flex items-center gap-1.5 px-2">
                  <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground truncate">{att.file.name}</span>
                </div>
              )}
              <button
                onClick={() => onRemove(i)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top">
          <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
            <Image className="h-4 w-4 mr-2" />
            Hình ảnh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <File className="h-4 w-4 mr-2" />
            Tệp đính kèm
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.csv,.xlsx" className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
