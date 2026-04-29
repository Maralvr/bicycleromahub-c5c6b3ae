import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shift, GuideNote } from "@/lib/mock-data";
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

  const handleSubmit = () => {
    if (!shift || !message.trim()) return;
    const note: GuideNote = {
      id: `gn-${Date.now()}`,
      shiftId: shift.id,
      authorStaffId,
      message: message.trim(),
      category,
      createdAt: new Date().toISOString(),
    };
    onSubmit(note);
    setMessage("");
    setCategory("general");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
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
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!message.trim()}>Send to admins</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
