import { useState } from "react";
import { Sparkles, UserPlus, ChevronDown, Handshake } from "lucide-react";
import { isNoGuideTour } from "@/lib/partner-tours";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Avatar } from "@/components/avatar";
import { suggestStaffForShift } from "@/lib/staff-matcher";
import { conflictLabel, useBusyGuides } from "@/lib/guide-conflicts";

import type { Shift, Staff } from "@/lib/mock-data";

export function AssignGuideCombobox({
  shift,
  allStaff,
  allShifts,
  currentStaffId,
  onSelect,
  label,
  className = "",
}: {
  shift: Shift;
  allStaff: Staff[];
  allShifts: Shift[];
  /** Currently-assigned guide id (shown as Current) */
  currentStaffId?: string | null;
  onSelect: (staff: Staff) => void;
  /** Override the default heading label */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Database-backed: covers primary shifts AND additional-guide commitments.
  const busy = useBusyGuides(shift);
  if (isNoGuideTour(shift.tourName) && !currentStaffId) {
    return (
      <div className={`p-3 rounded-lg border border-partner/40 bg-partner/5 ${className}`}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Handshake className="h-3.5 w-3.5 text-partner" />
          <span className="text-[10px] uppercase tracking-wider font-bold text-partner">
            Partner-operated
          </span>
          <span className="text-[10px] text-muted-foreground">
            — no Bicycle Roma guide needed for this booking
          </span>
        </div>
      </div>
    );
  }
  const ranked = suggestStaffForShift(shift, allStaff, allShifts, allStaff.length, busy);
  const byId = new Map(ranked.map((r) => [r.staff.id, r]));
  const top = ranked[0];
  const assignable = allStaff.filter((m) => m.role === "guide" || m.role === "admin");
  const sorted = [...assignable].sort((a, b) => {
    const sa = byId.get(a.id)?.score ?? -Infinity;
    const sb = byId.get(b.id)?.score ?? -Infinity;
    if (sa !== sb) return sb - sa;
    return a.name.localeCompare(b.name);
  });
  const current = currentStaffId ? assignable.find((m) => m.id === currentStaffId) : null;
  const triggerLabel = current
    ? `Reassign — currently ${current.name}`
    : top
      ? `Pick a guide — ${top.staff.name} recommended`
      : "Pick a guide…";
  return (
    <div className={`p-3 rounded-lg border border-border/60 bg-card ${className}`}>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] uppercase tracking-wider font-bold text-primary">
          {label ?? (current ? "Reassign guide" : "Assign a guide")}
        </span>
        <span className="text-[10px] text-muted-foreground">
          — recommended highlighted in green
        </span>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between h-9 font-normal">
            <span className="text-xs flex items-center gap-2 min-w-0">
              <UserPlus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{triggerLabel}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0"
          align="start"
          style={{ width: "var(--radix-popover-trigger-width)" }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <Command>
            <CommandInput placeholder="Search guides by name…" className="h-9" />
            <CommandList
              className="max-h-[min(18rem,60vh)] overflow-y-auto overscroll-contain touch-pan-y"
            >
              <CommandEmpty>No guide found.</CommandEmpty>
              <CommandGroup>
                {sorted.map((m) => {
                  const sg = byId.get(m.id);
                  const isTop = !!sg && !!top && top.staff.id === m.id;
                  const isRec = !!sg && sg.score > 0;
                  const isCurrent = m.id === currentStaffId;
                  const conflict = isCurrent ? null : findGuideConflict(m.id, shift, allShifts);
                  return (
                    <CommandItem
                      key={m.id}
                      value={m.name}
                      disabled={!!conflict}
                      onSelect={() => {
                        if (conflict) return;
                        onSelect(m);
                        setOpen(false);
                      }}
                      className={
                        conflict
                          ? "opacity-50 cursor-not-allowed"
                          : isRec
                            ? "bg-emerald-500/5 data-[selected=true]:bg-emerald-500/15 border-l-2 border-emerald-500/60 my-0.5"
                            : ""
                      }
                    >

                      <Avatar
                        name={m.name}
                        initials={m.avatar}
                        size="sm"
                        className="!h-6 !w-6 mr-2"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium">{m.name}</span>
                          {m.role === "admin" && (
                            <Badge variant="secondary" className="text-[8px] h-4 px-1">
                              admin
                            </Badge>
                          )}
                          {isCurrent && (
                            <Badge variant="secondary" className="text-[8px] h-4 px-1.5">
                              Current
                            </Badge>
                          )}
                          {isTop && (
                            <Badge className="text-[8px] h-4 px-1.5 bg-emerald-600 hover:bg-emerald-600 text-white">
                              Best fit
                            </Badge>
                          )}
                          {isRec && !isTop && (
                            <Badge
                              variant="outline"
                              className="text-[8px] h-4 px-1.5 border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
                            >
                              Recommended
                            </Badge>
                          )}
                          {sg && (
                            <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">
                              score {sg.score}
                            </span>
                          )}
                        </div>
                        {conflict ? (
                          <div className="text-[10px] text-destructive mt-0.5 truncate">
                            {conflictLabel(conflict)}
                          </div>
                        ) : (
                          sg &&
                          (sg.reasons.length > 0 || sg.warnings.length > 0) && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {sg.reasons.join(" · ")}
                              {sg.warnings.length > 0 && (
                                <span className="text-warning-foreground">
                                  {" "}
                                  · ⚠ {sg.warnings.join(", ")}
                                </span>
                              )}
                            </div>
                          )
                        )}

                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
