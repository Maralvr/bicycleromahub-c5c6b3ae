import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useBroadcastInteractions } from "@/lib/broadcast-interactions-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/avatar";
import { MessageSquare, SmilePlus, Send, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const EMOJI_OPTIONS = ["👍", "❤️", "🎉", "👏", "😂", "🙏"] as const;

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString();
}

export function BroadcastInteractions({ fieldUpdateId }: { fieldUpdateId: string }) {
  const { user, profile } = useAuth();
  const {
    register,
    getReactions,
    getComments,
    toggleReaction,
    addComment,
    deleteComment,
  } = useBroadcastInteractions();

  useEffect(() => {
    register(fieldUpdateId);
  }, [register, fieldUpdateId]);

  const reactions = getReactions(fieldUpdateId);
  const comments = getComments(fieldUpdateId);

  const [showComments, setShowComments] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const entry = map.get(r.emoji) ?? { count: 0, mine: false };
      entry.count += 1;
      if (user && r.profile_id === user.id) entry.mine = true;
      map.set(r.emoji, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [reactions, user]);

  const handleReact = (emoji: string) => {
    if (!user) {
      toast.error("Sign in to react");
      return;
    }
    void toggleReaction(fieldUpdateId, emoji);
    setShowPicker(false);
  };

  const postComment = async () => {
    const text = draft.trim();
    if (!text || !user || posting) return;
    if (text.length > 1000) {
      toast.error("Comment too long (max 1000 chars)");
      return;
    }
    setPosting(true);
    setDraft("");
    setShowComments(true);
    const { error } = await addComment(
      fieldUpdateId,
      text,
      profile?.display_name ?? "User",
      profile?.avatar_initials ?? null,
    );
    setPosting(false);
    if (error) toast.error("Couldn't post comment", { description: error });
  };

  const handleDelete = async (id: string, ownerId: string) => {
    if (!user || user.id !== ownerId) return;
    if (!confirm("Delete this comment?")) return;
    const { error } = await deleteComment(id);
    if (error) toast.error("Couldn't delete", { description: error });
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {grouped.map(([emoji, info]) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleReact(emoji)}
            className={`inline-flex items-center gap-1 min-h-[32px] px-2.5 py-1 rounded-full border text-sm transition-colors active:scale-95 ${
              info.mine
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-muted/60 border-border hover:bg-muted"
            }`}
            aria-pressed={info.mine}
          >
            <span className="leading-none">{emoji}</span>
            <span className="text-xs font-semibold">{info.count}</span>
          </button>
        ))}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-dashed border-border text-muted-foreground hover:bg-muted active:scale-95"
            aria-label="Add reaction"
          >
            <SmilePlus className="h-4 w-4" />
          </button>
          {showPicker && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowPicker(false)}
                aria-hidden
              />
              <div className="absolute z-20 mt-1 left-0 bg-popover border border-border rounded-xl shadow-lg p-1 flex gap-0.5">
                {EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => handleReact(e)}
                    className="h-10 w-10 rounded-lg hover:bg-muted text-xl leading-none active:scale-95"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 min-h-[32px] px-2.5 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60"
        >
          <MessageSquare className="h-4 w-4" />
          {comments.length > 0
            ? `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`
            : "Comment"}
        </button>
      </div>

      {showComments && (
        <div className="space-y-2">
          {comments.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No comments yet — be the first.</p>
          )}
          {comments.map((c) => {
            const canDelete = user?.id === c.author_profile_id;
            return (
              <div key={c.id} className="flex gap-2 items-start">
                <Avatar
                  name={c.author_name}
                  initials={c.author_initials ?? c.author_name.slice(0, 2).toUpperCase()}
                  size="sm"
                />
                <div className="flex-1 min-w-0 bg-muted/40 rounded-2xl px-3 py-2">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-semibold text-foreground truncate">{c.author_name}</span>
                    <span className="text-muted-foreground shrink-0">· {timeAgo(c.created_at)}</span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id, c.author_profile_id)}
                        className="ml-auto inline-flex items-center justify-center h-7 w-7 -mr-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{c.message}</p>
                </div>
              </div>
            );
          })}
          {user && (
            <div className="flex gap-2 items-end pt-1">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a comment…"
                rows={1}
                maxLength={1000}
                className="min-h-[40px] text-base sm:text-sm resize-none rounded-2xl px-3 py-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void postComment();
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                onClick={postComment}
                disabled={!draft.trim() || posting}
                className="h-10 w-10 shrink-0 rounded-full"
                aria-label="Send comment"
              >
                {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
