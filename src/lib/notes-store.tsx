import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { GuideNote, FieldUpdate, updates as initialUpdates } from "@/lib/mock-data";
import { staff as mockStaff } from "@/lib/mock-data";

type NotesStore = {
  notesByShift: Record<string, GuideNote[]>;
  feed: FieldUpdate[];
  addNote: (note: GuideNote, tourName: string) => void;
};

const NotesContext = createContext<NotesStore | null>(null);

const STORAGE_KEY = "ebr.guideNotes.v1";
const FEED_KEY = "ebr.activityFeed.v1";

export function NotesStoreProvider({ children }: { children: ReactNode }) {
  const [notesByShift, setNotesByShift] = useState<Record<string, GuideNote[]>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  });
  const [feed, setFeed] = useState<FieldUpdate[]>(() => {
    if (typeof window === "undefined") return initialUpdates;
    try {
      const stored = localStorage.getItem(FEED_KEY);
      return stored ? JSON.parse(stored) : initialUpdates;
    } catch { return initialUpdates; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notesByShift)); } catch {}
  }, [notesByShift]);
  useEffect(() => {
    try { localStorage.setItem(FEED_KEY, JSON.stringify(feed)); } catch {}
  }, [feed]);

  const addNote = (note: GuideNote, tourName: string) => {
    setNotesByShift((prev) => ({
      ...prev,
      [note.shiftId]: [...(prev[note.shiftId] || []), note],
    }));
    const author = mockStaff.find((s) => s.id === note.authorStaffId);
    const categoryLabel: Record<GuideNote["category"], string> = {
      general: "left a post-tour note",
      bike_issue: "reported a bike issue",
      customer: "left a customer note",
      incident: "reported an incident",
    };
    const update: FieldUpdate = {
      id: `u-${note.id}`,
      authorId: note.authorStaffId,
      message: `${author?.name || "Guide"} ${categoryLabel[note.category]} on "${tourName}": ${note.message}`,
      type: "field",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setFeed((prev) => [update, ...prev]);
  };

  return (
    <NotesContext.Provider value={{ notesByShift, feed, addNote }}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotesStore() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotesStore must be used within NotesStoreProvider");
  return ctx;
}
