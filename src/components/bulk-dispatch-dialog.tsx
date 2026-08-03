import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar } from "@/components/avatar";
import { Wand2, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { Shift } from "@/lib/mock-data";
import type { Staff } from "@/lib/mock-data";
import { suggestStaffForShift } from "@/lib/staff-matcher";
import { conflictLabel, useBusyGuidesForShifts, EMPTY_BUSY } from "@/lib/guide-conflicts";

import { isNoGuideTour } from "@/lib/partner-tours";

type Row = {
  shift: Shift;
  selected: boolean;
  chosenStaffId: string | null; // null = skip
  suggestionScore: number | null;
  topReason: string | null;
};

export function BulkDispatchDialog({
  open,
  onClose,
  unassignedShifts,
  allShifts,
  staff,
  onDispatch,
}: {
  open: boolean;
  onClose: () => void;
  unassignedShifts: Shift[];
  allShifts: Shift[];
  staff: Staff[];
  onDispatch: (assignments: Array<{ shift: Shift; staffId: string; staffName: string }>) => Promise<void> | void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  // One database-backed busy map per row window (primary + additional guides).
  const dispatchable = useMemo(
    () => unassignedShifts.filter((sh) => !isNoGuideTour(sh.tourName)),
    [unassignedShifts],
  );
  const busyByShift = useBusyGuidesForShifts(open ? dispatchable : []);

  // Build suggestions when the dialog opens.
  useEffect(() => {
    if (!open) return;
    // Mutable working copy so each row's suggestion accounts for prior picks (load balancing).
    let working = [...allShifts];
    const seedRows: Row[] = dispatchable
      .slice()
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
      .map((sh) => {
        const top = suggestStaffForShift(sh, staff, working, 1, busyByShift.get(sh.id) ?? EMPTY_BUSY)[0];
        if (top) {
          working = working.map((s) => (s.id === sh.id ? { ...s, assignedStaffId: top.staff.id, status: "pending" as const } : s));
        }
        return {
          shift: sh,
          selected: !!top,
          chosenStaffId: top ? top.staff.id : null,
          suggestionScore: top ? top.score : null,
          topReason: top ? (top.reasons[0] ?? null) : null,
        };
      });
    setRows(seedRows);
  }, [open, dispatchable, staff, allShifts, busyByShift]);

  const selectedCount = rows.filter((r) => r.selected && r.chosenStaffId).length;
  const unmatchedCount = rows.filter((r) => !r.chosenStaffId).length;
  const allSelected = useMemo(() => rows.every((r) => r.selected || !r.chosenStaffId), [rows]);

  const toggleAll = () => {
    const target = !allSelected;
    setRows((rs) => rs.map((r) => (r.chosenStaffId ? { ...r, selected: target } : r)));
  };

  const handleDispatch = async () => {
    const picks = rows
      .filter((r) => r.selected && r.chosenStaffId)
      .map((r) => {
        const member = staff.find((s) => s.id === r.chosenStaffId);
        return { shift: r.shift, staffId: r.chosenStaffId as string, staffName: member?.name ?? "Guide" };
      });
    if (picks.length === 0) return;
    setBusy(true);
    try {
      await onDispatch(picks);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" /> Bulk dispatch
          </DialogTitle>
          <DialogDescription>
            Review the suggested guide for every unassigned shift. Uncheck to skip, or pick a different guide.
            All selected shifts will be dispatched to their guide and put in <strong>pending</strong> state.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
            Nothing to dispatch — all shifts already have a guide.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 pt-2 pb-1 text-xs">
              <button
                type="button"
                onClick={toggleAll}
                className="font-semibold text-primary hover:underline"
              >
                {allSelected ? "Unselect all" : "Select all matched"}
              </button>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">
                  {selectedCount} selected · {rows.length} total
                </span>
                {unmatchedCount > 0 && (
                  <Badge variant="outline" className="border-warning/40 text-warning text-[10px]">
                    <AlertTriangle className="h-3 w-3 mr-1" /> {unmatchedCount} unmatched
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-lg divide-y divide-border">
              {rows.map((r, idx) => {
                const sh = r.shift;
                const member = r.chosenStaffId ? staff.find((s) => s.id === r.chosenStaffId) : null;
                const hasMatch = !!r.chosenStaffId;
                return (
                  <div
                    key={sh.id}
                    className={`p-3 flex items-start gap-3 ${!hasMatch ? "bg-warning/5" : r.selected ? "bg-primary/5" : ""}`}
                  >
                    <Checkbox
                      checked={r.selected && hasMatch}
                      disabled={!hasMatch || busy}
                      onCheckedChange={(checked) =>
                        setRows((rs) => rs.map((row, i) => (i === idx ? { ...row, selected: !!checked } : row)))
                      }
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">{sh.tourName}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {sh.date} · {sh.startTime}
                        </Badge>
                        {sh.meetingPoint && (
                          <span className="text-[11px] text-muted-foreground truncate">{sh.meetingPoint}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-muted-foreground">Suggested:</span>
                        <Select
                          value={r.chosenStaffId ?? "__none"}
                          onValueChange={(v) =>
                            setRows((rs) =>
                              rs.map((row, i) =>
                                i === idx
                                  ? { ...row, chosenStaffId: v === "__none" ? null : v, selected: v !== "__none" }
                                  : row,
                              ),
                            )
                          }
                          disabled={busy}
                        >
                          <SelectTrigger className="h-7 text-xs w-56">
                            <SelectValue placeholder="No guide" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">— Skip this shift —</SelectItem>
                            {staff
                              .filter((s) => s.role === "guide" && s.active !== false)
                              .map((s) => {
                                const conflict = busyByShift.get(sh.id)?.get(s.id) ?? null;
                                return (
                                  <SelectItem key={s.id} value={s.id} disabled={!!conflict}>
                                    {s.name}
                                    {conflict ? ` — ${conflictLabel(conflict)}` : ""}
                                  </SelectItem>
                                );
                              })}

                          </SelectContent>
                        </Select>
                        {r.suggestionScore != null && r.chosenStaffId && (
                          <Badge variant="outline" className="text-[10px] border-success/40 text-success">
                            Score {Math.round(r.suggestionScore)}
                          </Badge>
                        )}
                        {member && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Avatar name={member.name} initials={member.avatar} imageUrl={member.avatarUrl} size="sm" />
                          </div>
                        )}
                      </div>
                      {r.topReason && hasMatch && (
                        <div className="text-[11px] text-muted-foreground mt-1 italic">→ {r.topReason}</div>
                      )}
                      {!hasMatch && (
                        <div className="text-[11px] text-warning mt-1 font-medium">
                          No suitable guide found — pick one manually or skip.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleDispatch} disabled={busy || selectedCount === 0}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Dispatching…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-1" /> Dispatch {selectedCount} shift{selectedCount === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
