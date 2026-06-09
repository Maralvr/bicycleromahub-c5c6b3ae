import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useNoteTemplates, type NoteTemplate } from "@/lib/note-templates";
import { Loader2, Pencil, Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

export function NoteTemplatesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { templates, loading, create, update, remove } = useNoteTemplates(open);
  const [editing, setEditing] = useState<NoteTemplate | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const startNew = () => {
    setEditing(null);
    setName("");
    setBody("");
  };
  const startEdit = (t: NoteTemplate) => {
    setEditing(t);
    setName(t.name);
    setBody(t.body);
  };

  const save = async () => {
    if (!name.trim() || !body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await update(editing.id, { name: name.trim(), body });
        toast.success("Template updated");
      } else {
        await create(name.trim(), body);
        toast.success("Template created");
      }
      startNew();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    try {
      await remove(id);
      if (editing?.id === id) startNew();
    } catch (e) {
      toast.error("Couldn't delete", { description: (e as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Note templates
          </DialogTitle>
          <DialogDescription>
            Reusable booking-note snippets. Pick one when posting and edit before sending.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 flex-1 overflow-hidden">
          <div className="border rounded-md overflow-y-auto">
            <div className="p-2 border-b sticky top-0 bg-background">
              <Button size="sm" variant="outline" className="w-full" onClick={startNew}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New template
              </Button>
            </div>
            {loading ? (
              <div className="p-3 text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </div>
            ) : templates.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground italic">No templates yet.</div>
            ) : (
              <ul className="divide-y">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className={`p-2.5 text-sm flex items-center gap-2 cursor-pointer hover:bg-muted/50 ${
                      editing?.id === t.id ? "bg-primary/5" : ""
                    }`}
                    onClick={() => startEdit(t)}
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{t.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        void del(t.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="nt-name">Template name</Label>
              <Input
                id="nt-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Late arrival reminder"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nt-body">Body</Label>
              <Textarea
                id="nt-body"
                rows={10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="The note text. You can edit it again before sending each time."
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {editing ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
