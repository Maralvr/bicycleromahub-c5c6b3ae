import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { WaiverSignature } from "@/lib/waivers-store";

export function WaiverStatusBadge({ signatures, signed }: { signatures?: WaiverSignature[]; signed?: boolean }) {
  const isSigned = typeof signed === "boolean" ? signed : (signatures?.length ?? 0) > 0;
  if (isSigned) {
    return (
      <Badge className="bg-success/15 text-success-foreground border-success/40 text-[10px] uppercase tracking-wider font-bold gap-1">
        <CheckCircle2 className="h-3 w-3" /> Waiver signed
      </Badge>
    );
  }
  return (
    <Badge className="bg-destructive/15 text-destructive border-destructive/40 text-[10px] uppercase tracking-wider font-bold gap-1">
      <AlertCircle className="h-3 w-3" /> Waiver not signed
    </Badge>
  );
}

export function WaiverSignersList({ signatures }: { signatures: WaiverSignature[] }) {
  if (signatures.length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-destructive/5 border border-destructive/30 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-destructive mb-1">
          <AlertCircle className="h-3.5 w-3.5" /> No waiver on file
        </div>
        <div className="text-muted-foreground">
          Ask the customer to scan the Waiver Forever QR code on-site before the tour starts.
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 p-3 rounded-lg bg-success/5 border border-success/30 text-xs">
      <div className="flex items-center gap-1.5 font-semibold text-success-foreground mb-2">
        <CheckCircle2 className="h-3.5 w-3.5" /> Waiver signed by {signatures.length} {signatures.length === 1 ? "person" : "people"}
      </div>
      <ul className="space-y-1">
        {signatures.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-foreground/80">
            <span className="font-medium">{s.signer_name || s.email || "Anonymous"}</span>
            <span className="text-muted-foreground tabular-nums">
              {new Date(s.signed_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
