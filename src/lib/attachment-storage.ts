import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Attachment } from "@/lib/mock-data";

export const ATTACHMENT_BUCKET = "notification-attachments";

// Cost fix: attachments used to be persisted as inline base64 data URLs inside
// jsonb columns (guide_notifications grew to 225MB for 501 rows). Files now go
// to a private Storage bucket and the row keeps only a small `path` string.

function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } {
  const [header, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: mime }), mime };
}

function extFor(mime: string, name: string) {
  const fromName = name.includes(".") ? name.split(".").pop() : null;
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return mime.split("/")[1] ?? "bin";
}

/**
 * Uploads any base64 attachments to Storage and returns attachments that carry
 * only a `path`. Already-uploaded attachments pass through untouched.
 * On upload failure the original attachment is kept so nothing is lost.
 */
export async function persistAttachments(
  attachments: Attachment[] | undefined | null,
): Promise<Attachment[]> {
  if (!attachments?.length) return [];
  const out: Attachment[] = [];
  for (const a of attachments) {
    if (a.path || !a.dataUrl?.startsWith("data:")) {
      out.push(a);
      continue;
    }
    try {
      const { blob, mime } = dataUrlToBlob(a.dataUrl);
      const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${extFor(mime, a.name)}`;
      const { error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, blob, { contentType: mime, upsert: false });
      if (error) throw error;
      out.push({ id: a.id, name: a.name, mime: a.mime, size: a.size, path });
    } catch (e) {
      console.error("[attachments] upload failed, keeping inline copy", e);
      out.push(a);
    }
  }
  return out;
}

const urlCache = new Map<string, string>();

export async function signedUrlFor(path: string): Promise<string | null> {
  const cached = urlCache.get(path);
  if (cached) return cached;
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  urlCache.set(path, data.signedUrl);
  return data.signedUrl;
}

/** Resolves a displayable URL per attachment (signed URL, or legacy data URL). */
export function useAttachmentUrls(attachments: Attachment[] | undefined) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = (attachments ?? []).map((a) => a.path ?? a.id).join("|");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const next: Record<string, string> = {};
      for (const a of attachments ?? []) {
        if (a.path) {
          const url = await signedUrlFor(a.path);
          if (url) next[a.id] = url;
        } else if (a.dataUrl) {
          next[a.id] = a.dataUrl;
        }
      }
      if (!cancelled) setUrls(next);
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
