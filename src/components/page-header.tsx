import { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: "pending" | "accepted" | "rejected" | "unassigned" | "available" | "on_shift" | "off" | "done" | "todo" }) {
  const map: Record<string, string> = {
    accepted: "bg-success/15 text-success-foreground border-success/30",
    pending: "bg-warning/15 text-warning-foreground border-warning/30",
    rejected: "bg-destructive/15 text-destructive border-destructive/30",
    unassigned: "bg-muted text-muted-foreground border-border",
    available: "bg-success/15 text-success-foreground border-success/30",
    on_shift: "bg-primary/15 text-foreground border-primary/30",
    off: "bg-muted text-muted-foreground border-border",
    done: "bg-success/15 text-success-foreground border-success/30",
    todo: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status] || ""}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status.replace("_", " ")}
    </span>
  );
}
