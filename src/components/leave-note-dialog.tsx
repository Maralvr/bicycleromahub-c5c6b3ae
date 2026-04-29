import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shift, GuideNote, Attachment } from "@/lib/mock-data";
import { AttachmentPicker } from "@/components/attachment-picker";
import { Wrench, MessageSquare, AlertTriangle, User } from "lucide-react";

type Category = GuideNote["category"];

export function LeaveNoteDialog({
  shift,
  authorStaffId,
  open,
  onClose,
  onSubmit,
}: {
  shift: Shift | null;
  authorStaffId: string;
  open: boolean;
  onClose: () => void;
  onSubmit: (note: GuideNote) => void;
}) {
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const reset = () => {
    setMessage("");
    setCategory("general");
    setAttachments([]);
  };

  const handleSubmit = () => {
    if (!shift || (!message.trim() && attachments.length === 0)) return;
    const note: GuideNote = {
      id: `gn-${Date.now()}`,
      shiftId: shift.id,
      authorStaffId,
      message: message.trim() || (attachments.length === 1 ? `Shared ${attachments[0].name}` : `Shared ${attachments.length} files`),
      category,
      createdAt: new Date().toISOString(),
      attachments: attachments.length ? attachments : undefined,
    };
    onSubmit(note);
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Leave a note for admins</DialogTitle>
          <DialogDescription>
            {shift ? `${shift.tourName} · ${shift.date} ${shift.startTime}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general"><span className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> General</span></SelectItem>
                <SelectItem value="bike_issue"><span className="flex items-center gap-2"><Wrench className="h-3.5 w-3.5" /> Bike issue</span></SelectItem>
                <SelectItem value="customer"><span className="flex items-center gap-2"><User className="h-3.5 w-3.5" /> Customer</span></SelectItem>
                <SelectItem value="incident"><span className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Incident</span></SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What happened? Any issues with the bikes, customers, or the route?"
              rows={5}
            />
          </div>

          <div className="space-y-2">
            <Label>Attachments</Label>
            <AttachmentPicker attachments={attachments} onChange={setAttachments} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!message.trim() && attachments.length === 0}>Send to admins</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
