import { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 pb-6 border-b border-border/60">
      <div>
        {eyebrow && <div className="text-xs uppercase tracking-[0.18em] text-primary font-semibold mb-2">{eyebrow}</div>}
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground text-balance">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1.5 text-[15px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

const STATUS_MAP: Record<string, { dot: string; cls: string; label?: string }> = {
  accepted:   { dot: "bg-success",     cls: "bg-success/10 text-success-foreground border-success/30" },
  pending:    { dot: "bg-warning",     cls: "bg-warning/10 text-warning-foreground border-warning/40" },
  rejected:   { dot: "bg-destructive", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  unassigned: { dot: "bg-muted-foreground", cls: "bg-muted text-muted-foreground border-border" },
  available:  { dot: "bg-success",     cls: "bg-success/10 text-success-foreground border-success/30" },
  on_shift:   { dot: "bg-primary",     cls: "bg-primary/10 text-foreground border-primary/30", label: "on shift" },
  off:        { dot: "bg-muted-foreground", cls: "bg-muted text-muted-foreground border-border", label: "off duty" },
  done:       { dot: "bg-success",     cls: "bg-success/10 text-success-foreground border-success/30" },
  todo:       { dot: "bg-muted-foreground", cls: "bg-muted text-muted-foreground border-border" },
};

export function StatusPill({ status }: { status: keyof typeof STATUS_MAP | string }) {
  const cfg = STATUS_MAP[status] || { dot: "bg-muted-foreground", cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${cfg.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label || status.replace("_", " ")}
    </span>
  );
}
