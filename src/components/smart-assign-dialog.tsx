import { useEffect, useMemo, useState } from "react";
import { Sparkles, CheckCircle2, AlertTriangle, MapPin, Clock, Users, Bell, ArrowDownUp, EyeOff, Eye, Search, StickyNote } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";
import type { Shift } from "@/lib/mock-data";
import { useStaffStore } from "@/lib/staff-store";
import { rankAllCandidates, type StaffCandidate } from "@/lib/staff-matcher";

type SortMode = "score" | "name" | "least_busy";

type Props = {
  shift: Shift | null;
  allShifts: Shift[];
  open: boolean;
  onClose: () => void;
  onAssign: (shiftId: string, staffId: string, staffName: string) => void;
};

export function SmartAssignDialog({ shift, allShifts, open, onClose, onAssign }: Props) {
  const { staff } = useStaffStore();
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [showIneligible, setShowIneligible] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open, shift?.id]);

  const candidates = useMemo<StaffCandidate[]>(() => {
    if (!shift) return [];
    const ranked = rankAllCandidates(shift, staff, allShifts);
    const sorted = [...ranked].sort((a, b) => {
      if (sortMode === "name") return a.staff.name.localeCompare(b.staff.name);
      if (sortMode === "least_busy") {
        const busy = (id: string) =>
          allShifts.filter((s) => s.assignedStaffId === id && s.status !== "rejected" && s.date === shift.date).length;
        return busy(a.staff.id) - busy(b.staff.id);
      }
      // default score: keep eligible-first, then by score
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.score - a.score;
    });
    const filtered = showIneligible ? sorted : sorted.filter((c) => c.eligible);
    const q = search.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((c) => c.staff.name.toLowerCase().includes(q));
  }, [shift, staff, allShifts, sortMode, showIneligible, search]);

  const eligibleCount = useMemo(
    () => (shift ? rankAllCandidates(shift, staff, allShifts).filter((c) => c.eligible).length : 0),
    [shift, staff, allShifts],
  );
  const best = candidates.find((c) => c.eligible);

  const handleAssign = (c: StaffCandidate) => {
    if (!shift) return;
    onAssign(shift.id, c.staff.id, c.staff.name);
    onClose();
  };

  const handleAutoAssign = () => {
    if (!shift || !best) return;
    handleAssign(best);
  };

  if (!shift) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Smart assignment
          </DialogTitle>
          <DialogDescription className="text-left">
            {eligibleCount} of {staff.length} guides match this shift's requirements and are free.
          </DialogDescription>

          {/* Shift recap */}
          <div className="mt-3 p-3 rounded-lg bg-muted/40 border border-border/40 text-xs space-y-1.5">
            <div className="font-semibold text-foreground text-sm">{shift.tourName}</div>
            <div className="flex items-center gap-3 flex-wrap text-muted-foreground">
              <span className="flex items-center gap-1 tabular-nums"><Clock className="h-3 w-3" /> {shift.date} · {shift.startTime}–{shift.endTime}</span>
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {shift.meetingPoint}</span>
              {shift.participants && (
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {shift.participants.adults + shift.participants.teens + shift.participants.infants} pax</span>
              )}
            </div>
            {shift.requiredTags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap pt-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">Requires:</span>
                {shift.requiredTags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] h-5 font-normal">{tag}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1 mr-1">
                <ArrowDownUp className="h-3 w-3" /> Sort
              </span>
              {([
                { v: "score" as const, label: "Best fit" },
                { v: "least_busy" as const, label: "Least busy" },
                { v: "name" as const, label: "Name" },
              ]).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setSortMode(opt.v)}
                  className={cn(
                    "h-7 px-2.5 text-xs font-medium rounded-md transition-colors",
                    sortMode === opt.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowIneligible((v) => !v)}
              className="h-7 px-2.5 text-xs font-medium rounded-md flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              {showIneligible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showIneligible ? "Hide ineligible" : "Show ineligible"}
            </button>
          </div>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 pt-3 pb-1 border-b border-border/40 bg-background">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search guides by name…"
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>

        {/* Candidates list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-background">
          {candidates.length === 0 ? (
            <div className="text-sm text-muted-foreground italic flex items-center gap-2 p-6 justify-center">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {search.trim()
                ? `No guides match "${search.trim()}".`
                : "No staff match this shift. Try toggling \"Show ineligible\" or duplicate to a different time."}
            </div>
          ) : (
            candidates.map((c, i) => (
              <CandidateRow key={c.staff.id} c={c} isBest={c.eligible && i === 0 && sortMode === "score" && !search.trim()} onAssign={() => handleAssign(c)} />
            ))
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border/60 bg-card">
          <div className="flex items-center justify-between gap-2 w-full flex-wrap">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!best} onClick={handleAutoAssign}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Auto-assign best fit
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRow({ c, isBest, onAssign }: { c: StaffCandidate; isBest: boolean; onAssign: () => void }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-all",
        c.eligible
          ? isBest
            ? "bg-gradient-to-r from-primary/10 via-card to-card border-primary/40 shadow-[var(--shadow-elegant)]"
            : "bg-card border-border/60 hover:border-primary/30"
          : "bg-muted/30 border-border/40 opacity-70",
      )}
    >
      <Avatar name={c.staff.name} initials={c.staff.avatar} size="md" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm text-foreground">{c.staff.name}</span>
          <span className="text-[10px] text-muted-foreground capitalize">· {c.staff.role}</span>
          {isBest && <Badge className="text-[8px] uppercase tracking-wider h-4 px-1.5 bg-primary text-primary-foreground">Best fit</Badge>}
          {c.eligible && (
            <span className="ml-auto text-[10px] text-muted-foreground tabular-nums flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-success" /> Score {c.score}
            </span>
          )}
          {!c.eligible && (
            <span className="ml-auto text-[10px] text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Ineligible
            </span>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
          {c.eligible ? (
            <>
              {c.reasons.join(" · ")}
              {c.warnings.length > 0 && (
                <span className="text-warning-foreground"> · ⚠ {c.warnings.join(", ")}</span>
              )}
            </>
          ) : (
            <span className="text-destructive">{c.disqualifiedReason}</span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
          <span>{c.staff.languages.join(" · ")}</span>
          <span>·</span>
          <span>{c.staff.licenses.join(", ") || "no licenses"}</span>
        </div>
      </div>

      <Button
        size="sm"
        variant={isBest ? "default" : "outline"}
        disabled={!c.eligible}
        className="h-8 text-xs px-3 flex-shrink-0"
        onClick={onAssign}
      >
        <Bell className="h-3 w-3 mr-1.5" />
        Assign & notify
      </Button>
    </div>
  );
}
