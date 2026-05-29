import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentPicker, AttachmentList } from "@/components/attachment-picker";
import type { Attachment } from "@/lib/mock-data";
import { MessageSquare, Send, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type BookingNote = {
  id: string;
  shift_id: string;
  author_profile_id: string;
  author_name: string;
  author_role: string;
  message: string;
  attachments: Attachment[];
  created_at: string;
};

type Props = {
  shiftId: string;
  /** Whether the current user is allowed to post (admin or assigned guide). */
  canPost: boolean;
  /** Compact mode renders without the outer card frame. */
  compact?: boolean;
};

export function BookingNotesThread({ shiftId, canPost, compact }: Props) {
  const { user, profile, isAdmin } = useAuth();
  const [notes, setNotes] = useState<BookingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("booking_notes" as never)
      .select("*")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: true });
    if (!error) setNotes((data ?? []) as unknown as BookingNote[]);
    setLoading(false);
  }, [shiftId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`booking-notes-${shiftId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_notes", filter: `shift_id=eq.${shiftId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [shiftId, load]);

  const post = async () => {
    if (!user || !message.trim()) return;
    setPosting(true);
    try {
      const payload = {
        shift_id: shiftId,
        author_profile_id: user.id,
        author_name: profile?.display_name || user.email || "User",
        author_role: isAdmin ? "admin" : "guide",
        message: message.trim(),
        attachments,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("booking_notes" as never) as any).insert(payload);
      if (error) throw error;
      setMessage("");
      setAttachments([]);
    } catch (e) {
      toast.error("Couldn't post note", { description: (e as Error).message });
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    const { error } = await supabase.from("booking_notes" as never).delete().eq("id", id);
    if (error) toast.error("Couldn't delete", { description: error.message });
  };

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    compact ? (
      <div className="space-y-3">{children}</div>
    ) : (
      <div className="rounded-lg border border-border/60 bg-card p-3 space-y-3">{children}</div>
    );

  return (
    <Wrapper>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        <MessageSquare className="h-3 w-3" /> Booking notes {notes.length > 0 && `(${notes.length})`}
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : notes.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No notes yet.</div>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => {
            const mine = n.author_profile_id === user?.id;
            return (
              <div
                key={n.id}
                className={`p-2.5 rounded-md border text-xs ${
                  n.author_role === "admin"
                    ? "bg-primary/5 border-primary/20"
                    : "bg-muted/40 border-border/60"
                }`}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-foreground">{n.author_name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {n.author_role}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    · {new Date(n.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  {mine && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 ml-auto"
                      onClick={() => remove(n.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="text-foreground/85 leading-snug whitespace-pre-wrap">{n.message}</div>
                {n.attachments && n.attachments.length > 0 && (
                  <AttachmentList attachments={n.attachments} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {canPost && (
        <div className="space-y-2 pt-2 border-t border-border/40">
          <Textarea
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a note for this booking…"
            className="text-xs"
          />
          <AttachmentPicker
            attachments={attachments}
            onChange={setAttachments}
            label="Attach"
            maxFiles={3}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={post} disabled={posting || !message.trim()}>
              {posting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1.5" />
              )}
              Post note
            </Button>
          </div>
        </div>
      )}
    </Wrapper>
  );
}
