import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type ReactionRow = {
  id: string;
  field_update_id: string;
  profile_id: string;
  emoji: string;
};

export type CommentRow = {
  id: string;
  field_update_id: string;
  author_profile_id: string;
  author_name: string;
  author_initials: string | null;
  message: string;
  created_at: string;
};

type Ctx = {
  register: (fieldUpdateId: string) => void;
  getReactions: (fieldUpdateId: string) => ReactionRow[];
  getComments: (fieldUpdateId: string) => CommentRow[];
  toggleReaction: (fieldUpdateId: string, emoji: string) => Promise<void>;
  addComment: (
    fieldUpdateId: string,
    message: string,
    authorName: string,
    authorInitials: string | null,
  ) => Promise<{ error?: string }>;
  deleteComment: (id: string) => Promise<{ error?: string }>;
};

const BroadcastCtx = createContext<Ctx | null>(null);

export function BroadcastInteractionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const knownIds = useRef<Set<string>>(new Set());
  const pending = useRef<Set<string>>(new Set());
  const flushTimer = useRef<number | null>(null);

  const reactionsByFu = useMemo(() => {
    const m = new Map<string, ReactionRow[]>();
    for (const r of reactions) {
      const list = m.get(r.field_update_id) ?? [];
      list.push(r);
      m.set(r.field_update_id, list);
    }
    return m;
  }, [reactions]);

  const commentsByFu = useMemo(() => {
    const m = new Map<string, CommentRow[]>();
    for (const c of comments) {
      const list = m.get(c.field_update_id) ?? [];
      list.push(c);
      m.set(c.field_update_id, list);
    }
    for (const list of m.values())
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return m;
  }, [comments]);

  const flush = useCallback(async () => {
    flushTimer.current = null;
    const ids = Array.from(pending.current);
    pending.current.clear();
    if (ids.length === 0) return;
    ids.forEach((i) => knownIds.current.add(i));
    const [r, c] = await Promise.all([
      supabase.from("broadcast_reactions").select("*").in("field_update_id", ids),
      supabase
        .from("broadcast_comments")
        .select("*")
        .in("field_update_id", ids)
        .order("created_at", { ascending: true }),
    ]);
    if (!r.error && r.data) {
      const data = r.data as ReactionRow[];
      setReactions((prev) => [
        ...prev.filter((x) => !ids.includes(x.field_update_id)),
        ...data,
      ]);
    }
    if (!c.error && c.data) {
      const data = c.data as CommentRow[];
      setComments((prev) => [
        ...prev.filter((x) => !ids.includes(x.field_update_id)),
        ...data,
      ]);
    }
  }, []);

  const register = useCallback(
    (id: string) => {
      if (!id) return;
      if (knownIds.current.has(id) || pending.current.has(id)) return;
      pending.current.add(id);
      if (flushTimer.current == null) {
        flushTimer.current = window.setTimeout(flush, 30);
      }
    },
    [flush],
  );

  // Single realtime channel for both tables, scoped to known broadcast ids.
  useEffect(() => {
    const channel = supabase
      .channel(`broadcast-interactions-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "broadcast_reactions" },
        (payload) => {
          const newRow = payload.new as ReactionRow | null;
          const oldRow = payload.old as { id?: string; field_update_id?: string } | null;
          if (payload.eventType === "INSERT" && newRow) {
            if (!knownIds.current.has(newRow.field_update_id)) return;
            setReactions((prev) => (prev.some((r) => r.id === newRow.id) ? prev : [...prev, newRow]));
          } else if (payload.eventType === "DELETE" && oldRow?.id) {
            setReactions((prev) => prev.filter((r) => r.id !== oldRow.id));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "broadcast_comments" },
        (payload) => {
          const newRow = payload.new as CommentRow | null;
          const oldRow = payload.old as { id?: string } | null;
          if (payload.eventType === "INSERT" && newRow) {
            if (!knownIds.current.has(newRow.field_update_id)) return;
            setComments((prev) => (prev.some((c) => c.id === newRow.id) ? prev : [...prev, newRow]));
          } else if (payload.eventType === "UPDATE" && newRow) {
            setComments((prev) => prev.map((c) => (c.id === newRow.id ? newRow : c)));
          } else if (payload.eventType === "DELETE" && oldRow?.id) {
            setComments((prev) => prev.filter((c) => c.id !== oldRow.id));
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const getReactions = useCallback((id: string) => reactionsByFu.get(id) ?? [], [reactionsByFu]);
  const getComments = useCallback((id: string) => commentsByFu.get(id) ?? [], [commentsByFu]);

  const toggleReaction: Ctx["toggleReaction"] = useCallback(
    async (fieldUpdateId, emoji) => {
      if (!user) return;
      const existing = reactions.find(
        (r) => r.field_update_id === fieldUpdateId && r.profile_id === user.id && r.emoji === emoji,
      );
      if (existing) {
        setReactions((prev) => prev.filter((r) => r.id !== existing.id));
        const { error } = await supabase.from("broadcast_reactions").delete().eq("id", existing.id);
        if (error) setReactions((prev) => [...prev, existing]);
      } else {
        const tmp: ReactionRow = {
          id: `tmp-${Math.random().toString(36).slice(2)}`,
          field_update_id: fieldUpdateId,
          profile_id: user.id,
          emoji,
        };
        setReactions((prev) => [...prev, tmp]);
        const { data, error } = await supabase
          .from("broadcast_reactions")
          .insert({ field_update_id: fieldUpdateId, profile_id: user.id, emoji })
          .select()
          .single();
        if (error) {
          setReactions((prev) => prev.filter((r) => r.id !== tmp.id));
        } else if (data) {
          setReactions((prev) =>
            prev.map((r) => (r.id === tmp.id ? (data as ReactionRow) : r)),
          );
        }
      }
    },
    [reactions, user],
  );

  const addComment: Ctx["addComment"] = useCallback(
    async (fieldUpdateId, message, authorName, authorInitials) => {
      if (!user) return { error: "Not signed in" };
      const tmp: CommentRow = {
        id: `tmp-${Math.random().toString(36).slice(2)}`,
        field_update_id: fieldUpdateId,
        author_profile_id: user.id,
        author_name: authorName,
        author_initials: authorInitials,
        message,
        created_at: new Date().toISOString(),
      };
      setComments((prev) => [...prev, tmp]);
      const { data, error } = await supabase
        .from("broadcast_comments")
        .insert({
          field_update_id: fieldUpdateId,
          author_profile_id: user.id,
          author_name: authorName,
          author_initials: authorInitials,
          message,
        })
        .select()
        .single();
      if (error) {
        setComments((prev) => prev.filter((c) => c.id !== tmp.id));
        return { error: error.message };
      }
      if (data) {
        setComments((prev) => prev.map((c) => (c.id === tmp.id ? (data as CommentRow) : c)));
      }
      return {};
    },
    [user],
  );

  const deleteComment: Ctx["deleteComment"] = useCallback(async (id) => {
    const prev = comments;
    setComments((cs) => cs.filter((c) => c.id !== id));
    const { error } = await supabase.from("broadcast_comments").delete().eq("id", id);
    if (error) {
      setComments(prev);
      return { error: error.message };
    }
    return {};
  }, [comments]);

  const value: Ctx = {
    register,
    getReactions,
    getComments,
    toggleReaction,
    addComment,
    deleteComment,
  };

  return <BroadcastCtx.Provider value={value}>{children}</BroadcastCtx.Provider>;
}

export function useBroadcastInteractions() {
  const ctx = useContext(BroadcastCtx);
  if (!ctx) throw new Error("useBroadcastInteractions must be used within BroadcastInteractionsProvider");
  return ctx;
}
