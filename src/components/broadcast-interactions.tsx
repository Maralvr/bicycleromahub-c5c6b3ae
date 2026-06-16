import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/avatar";
import { MessageSquare, SmilePlus, Send, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const EMOJI_OPTIONS = ["👍", "❤️", "🎉", "👏", "😂", "🙏"] as const;

type ReactionRow = {
  id: string;
  field_update_id: string;
  profile_id: string;
  emoji: string;
};

type CommentRow = {
  id: string;
  field_update_id: string;
  author_profile_id: string;
  author_name: string;
  author_initials: string | null;
  message: string;
  created_at: string;
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString();
}

export function BroadcastInteractions({ fieldUpdateId }: { fieldUpdateId: string }) {
  const { user, profile, isAdmin } = useAuth();
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([
      supabase
        .from("broadcast_reactions")
        .select("*")
        .eq("field_update_id", fieldUpdateId),
      supabase
        .from("broadcast_comments")
        .select("*")
        .eq("field_update_id", fieldUpdateId)
        .order("created_at", { ascending: true }),
    ]);
    if (!r.error) setReactions((r.data ?? []) as ReactionRow[]);
    if (!c.error) setComments((c.data ?? []) as CommentRow[]);
  }, [fieldUpdateId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`bcast-${fieldUpdateId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "broadcast_reactions", filter: `field_update_id=eq.${fieldUpdateId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "broadcast_comments", filter: `field_update_id=eq.${fieldUpdateId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fieldUpdateId, load]);

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

  const toggleReaction = async (emoji: string) => {
    if (!user) {
      toast.error("Sign in to react");
      return;
    }
    const mine = reactions.find((r) => r.profile_id === user.id && r.emoji === emoji);
    if (mine) {
      setReactions((prev) => prev.filter((r) => r.id !== mine.id));
      const { error } = await supabase.from("broadcast_reactions").delete().eq("id", mine.id);
      if (error) {
        toast.error("Couldn't remove reaction");
        void load();
      }
    } else {
      const optimistic: ReactionRow = {
        id: `tmp-${Math.random()}`,
        field_update_id: fieldUpdateId,
        profile_id: user.id,
        emoji,
      };
      setReactions((prev) => [...prev, optimistic]);
      const { error } = await supabase.from("broadcast_reactions").insert({
        field_update_id: fieldUpdateId,
        profile_id: user.id,
        emoji,
      });
      if (error) {
        toast.error("Couldn't add reaction");
        void load();
      }
    }
    setShowPicker(false);
  };

  const postComment = async () => {
    const text = draft.trim();
    if (!text || !user) return;
    if (text.length > 1000) {
      toast.error("Comment too long (max 1000 chars)");
      return;
    }
    setPosting(true);
    const { error } = await supabase.from("broadcast_comments").insert({
      field_update_id: fieldUpdateId,
      author_profile_id: user.id,
      author_name: profile?.display_name ?? "User",
      author_initials: profile?.avatar_initials ?? null,
      message: text,
    });
    setPosting(false);
    if (error) {
      toast.error("Couldn't post comment", { description: error.message });
      return;
    }
    setDraft("");
    setShowComments(true);
  };

  const deleteComment = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    const prev = comments;
    setComments((cs) => cs.filter((c) => c.id !== id));
    const { error } = await supabase.from("broadcast_comments").delete().eq("id", id);
    if (error) {
      toast.error("Couldn't delete", { description: error.message });
      setComments(prev);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {grouped.map(([emoji, info]) => (
          <button
            key={emoji}
            type="button"
            onClick={() => toggleReaction(emoji)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-colors ${
              info.mine
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-muted/60 border-border hover:bg-muted"
            }`}
            aria-pressed={info.mine}
          >
            <span className="text-sm leading-none">{emoji}</span>
            <span className="font-medium">{info.count}</span>
          </button>
        ))}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:bg-muted"
            aria-label="Add reaction"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
          {showPicker && (
            <div className="absolute z-20 mt-1 left-0 bg-popover border border-border rounded-lg shadow-md p-1 flex gap-1">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => toggleReaction(e)}
                  className="h-8 w-8 rounded hover:bg-muted text-lg leading-none"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {comments.length > 0 ? `${comments.length} ${comments.length === 1 ? "comment" : "comments"}` : "Comment"}
        </button>
      </div>

      {showComments && (
        <div className="space-y-2 pl-1">
          {comments.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No comments yet — be the first.</p>
          )}
          {comments.map((c) => {
            const canDelete = user?.id === c.author_profile_id || isAdmin;
            return (
              <div key={c.id} className="flex gap-2 items-start">
                <Avatar
                  name={c.author_name}
                  initials={c.author_initials ?? c.author_name.slice(0, 2).toUpperCase()}
                  size="sm"
                />
                <div className="flex-1 min-w-0 bg-muted/40 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-semibold text-foreground">{c.author_name}</span>
                    <span className="text-muted-foreground">· {timeAgo(c.created_at)}</span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => deleteComment(c.id)}
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3 w-3" />
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
                className="min-h-[2.25rem] text-sm resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void postComment();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={postComment}
                disabled={!draft.trim() || posting}
              >
                {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
