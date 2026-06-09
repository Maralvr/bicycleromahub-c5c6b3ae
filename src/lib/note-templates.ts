import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type NoteTemplate = {
  id: string;
  name: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function useNoteTemplates(enabled = true) {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("note_templates")
      .select("*")
      .order("name", { ascending: true });
    if (error) setError(error.message);
    else {
      setTemplates((data ?? []) as NoteTemplate[]);
      setError(null);
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (name: string, body: string) => {
      const { data, error } = await supabase
        .from("note_templates")
        .insert({ name, body })
        .select()
        .single();
      if (error) throw error;
      setTemplates((t) => [...t, data as NoteTemplate].sort((a, b) => a.name.localeCompare(b.name)));
      return data as NoteTemplate;
    },
    [],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Pick<NoteTemplate, "name" | "body">>) => {
      const { data, error } = await supabase
        .from("note_templates")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      setTemplates((t) =>
        t.map((x) => (x.id === id ? (data as NoteTemplate) : x)).sort((a, b) => a.name.localeCompare(b.name)),
      );
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("note_templates").delete().eq("id", id);
    if (error) throw error;
    setTemplates((t) => t.filter((x) => x.id !== id));
  }, []);

  return { templates, loading, error, refresh: load, create, update, remove };
}
