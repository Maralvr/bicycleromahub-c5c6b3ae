import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Attachment } from "@/lib/mock-data";
import { Paperclip, X, FileText } from "lucide-react";
import { toast } from "sonner";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function AttachmentPicker({
  attachments,
  onChange,
  label = "Attach photo or document",
}: {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name} is too large (max 10MB)`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      next.push({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
      });
    }
    onChange([...attachments, ...next]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (id: string) => onChange(attachments.filter((a) => a.id !== id));

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Paperclip className="h-3.5 w-3.5 mr-1.5" /> {label}
      </Button>
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 p-2 rounded-md border border-border/60 bg-card text-xs">
              {a.mime.startsWith("image/") ? (
                <img src={a.dataUrl} alt={a.name} className="h-8 w-8 rounded object-cover" />
              ) : (
                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{a.name}</div>
                <div className="text-[10px] text-muted-foreground">{(a.size / 1024).toFixed(1)} KB</div>
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(a.id)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={a.dataUrl}
          download={a.name}
          className="flex items-center gap-2 p-2 rounded-md border border-border/60 bg-card hover:bg-accent/50 transition-colors"
        >
          {a.mime.startsWith("image/") ? (
            <img src={a.dataUrl} alt={a.name} className="h-9 w-9 rounded object-cover shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="truncate text-xs font-medium">{a.name}</div>
            <div className="text-[10px] text-muted-foreground">{(a.size / 1024).toFixed(1)} KB</div>
          </div>
        </a>
      ))}
    </div>
  );
}
