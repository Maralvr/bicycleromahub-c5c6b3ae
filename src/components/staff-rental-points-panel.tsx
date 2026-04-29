import { useMemo } from "react";
import { MapPin, Star, Plus, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRentalPoints } from "@/lib/rental-points";
import { useStaffRentalPoints } from "@/lib/staff-rental-points";
import { toast } from "sonner";

type Props = {
  /** auth user id (= staff.profile_id). null/undefined for mock-only staff. */
  userId: string | null | undefined;
};

/**
 * Admin panel inside the staff sheet that shows which rental points the
 * staff member is assigned to, with controls to add, remove, or mark primary.
 */
export function StaffRentalPointsPanel({ userId }: Props) {
  const { points, loading: pointsLoading } = useRentalPoints();
  const { assignments, loading: assignLoading, assign, unassign, setPrimary } = useStaffRentalPoints(userId);

  const assignedById = useMemo(() => {
    const m = new Map<string, (typeof assignments)[number]>();
    for (const a of assignments) m.set(a.rental_point_id, a);
    return m;
  }, [assignments]);

  const unassignedPoints = points.filter((p) => p.active && !assignedById.has(p.id));

  if (!userId) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        This staff record isn't linked to a user account yet, so rental point assignments aren't available.
      </div>
    );
  }

  if (pointsLoading || assignLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading rental points…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {assignments.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-2">
          Not assigned to any rental point yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {assignments.map((a) => {
            const point = points.find((p) => p.id === a.rental_point_id);
            return (
              <div
                key={a.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/60 bg-muted/30"
              >
                <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate flex items-center gap-1.5">
                    {point?.name ?? "Unknown point"}
                    {a.is_primary && (
                      <Badge className="h-4 px-1.5 text-[9px] uppercase tracking-wider bg-primary/15 text-primary border-0">
                        Primary
                      </Badge>
                    )}
                  </div>
                  {point?.address && (
                    <div className="text-[10px] text-muted-foreground truncate">{point.address}</div>
                  )}
                </div>
                {!a.is_primary && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    title="Set as primary"
                    onClick={async () => {
                      try {
                        await setPrimary(a.rental_point_id);
                        toast.success("Primary point updated");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed");
                      }
                    }}
                  >
                    <Star className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  title="Remove assignment"
                  onClick={async () => {
                    try {
                      await unassign(a.rental_point_id);
                      toast.success("Removed");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    }
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {unassignedPoints.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Assign to point
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 pt-1.5 pb-1">
              Available points
            </div>
            {unassignedPoints.map((p) => (
              <button
                key={p.id}
                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted flex items-center gap-2"
                onClick={async () => {
                  try {
                    await assign(p.id);
                    toast.success(`Assigned to ${p.name}`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                }}
              >
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
