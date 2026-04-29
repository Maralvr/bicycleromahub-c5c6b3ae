import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Attachment } from "@/lib/mock-data";
import { Paperclip, X, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
export const DEFAULT_MAX_FILES = 5;

/**
 * Compress an image File to stay under `maxBytes`.
 * - Downscales (max 1920px on the longest side) and re-encodes as JPEG.
 * - Iteratively lowers quality until the result fits, or returns the smallest version.
 */
export async function compressImage(file: File, maxBytes: number): Promise<{ dataUrl: string; size: number; mime: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  // Already small enough — keep original
  if (file.size <= maxBytes) {
    return { dataUrl, size: file.size, mime: file.type || "image/jpeg" };
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const MAX_DIM = 1920;
  let { width, height } = img;
  if (width > MAX_DIM || height > MAX_DIM) {
    const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl, size: file.size, mime: file.type || "image/jpeg" };
  ctx.drawImage(img, 0, 0, width, height);

  const qualities = [0.85, 0.7, 0.55, 0.4, 0.25];
  let best = { dataUrl, size: file.size, mime: file.type || "image/jpeg" };
  for (const q of qualities) {
    const out = canvas.toDataURL("image/jpeg", q);
    const size = Math.round((out.length - "data:image/jpeg;base64,".length) * 0.75);
    if (size < best.size) best = { dataUrl: out, size, mime: "image/jpeg" };
    if (size <= maxBytes) return { dataUrl: out, size, mime: "image/jpeg" };
  }
  return best;
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export async function processFiles(
  files: FileList | File[],
  opts: { maxFiles: number; maxSize: number; existingCount: number },
): Promise<Attachment[]> {
  const arr = Array.from(files);
  const slotsLeft = Math.max(0, opts.maxFiles - opts.existingCount);
  if (arr.length > slotsLeft) {
    toast.error(`You can attach up to ${opts.maxFiles} file${opts.maxFiles === 1 ? "" : "s"}.`);
  }
  const accepted = arr.slice(0, slotsLeft);
  const out: Attachment[] = [];
  for (const file of accepted) {
    let dataUrl: string;
    let size = file.size;
    let mime = file.type || "application/octet-stream";

    if (mime.startsWith("image/")) {
      const compressed = await compressImage(file, opts.maxSize);
      dataUrl = compressed.dataUrl;
      size = compressed.size;
      mime = compressed.mime;
      if (size > opts.maxSize) {
        toast.error(`${file.name} is still too large after compression (max ${(opts.maxSize / 1024 / 1024).toFixed(0)}MB).`);
        continue;
      }
      if (size < file.size) {
        toast.success(`Compressed ${file.name} (${(file.size / 1024).toFixed(0)}KB → ${(size / 1024).toFixed(0)}KB)`);
      }
    } else {
      if (file.size > opts.maxSize) {
        toast.error(`${file.name} is too large (max ${(opts.maxSize / 1024 / 1024).toFixed(0)}MB).`);
        continue;
      }
      dataUrl = await readFileAsDataUrl(file);
    }

    out.push({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      mime,
      size,
      dataUrl,
    });
  }
  return out;
}

export function AttachmentPicker({
  attachments,
  onChange,
  label = "Attach photo or document",
  maxFiles = DEFAULT_MAX_FILES,
  maxSize = DEFAULT_MAX_SIZE,
}: {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  label?: string;
  maxFiles?: number;
  maxSize?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const next = await processFiles(files, {
        maxFiles,
        maxSize,
        existingCount: attachments.length,
      });
      if (next.length) onChange([...attachments, ...next]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (id: string) => onChange(attachments.filter((a) => a.id !== id));
  const atLimit = attachments.length >= maxFiles;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy || atLimit}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5 mr-1.5" />}
          {busy ? "Processing…" : label}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {attachments.length}/{maxFiles} · max {(maxSize / 1024 / 1024).toFixed(0)}MB · images auto-compressed
        </span>
      </div>
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
