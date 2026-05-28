import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAdmin } from "@/lib/require-admin";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/bokun-runs")({
  component: BokunRunsPage,
});

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  from_date: string;
  to_date: string;
  trigger: string;
  total_seen: number;
  total_hits: number | null;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  success: boolean;
  error_message: string | null;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function duration(start: string, end: string | null) {
  if (!end) return "running…";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function progressPct(r: RunRow): number | null {
  // Done → always 100%
  if (r.finished_at) return 100;
  if (!r.total_hits || r.total_hits <= 0) return null;
  const pct = Math.min(99, Math.round((r.total_seen / r.total_hits) * 100));
  return pct;
}

function BokunRunsPage() {
  const { ready } = useRequireAdmin();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("bokun_import_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);
    setRuns((data as unknown as RunRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  // Auto-poll every 2s while any run is still in flight
  const hasRunning = runs.some((r) => !r.finished_at);
  const runningCount = runs.filter((r) => !r.finished_at).length;
  useEffect(() => {
    if (!ready || !hasRunning) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [ready, hasRunning, load]);

  const cancelRunning = useCallback(async () => {
    if (!hasRunning) return;
    if (!confirm(`Cancel ${runningCount} running import${runningCount === 1 ? "" : "s"}?`)) return;
    const { error } = await supabase
      .from("bokun_import_runs")
      .update({
        finished_at: new Date().toISOString(),
        success: false,
        error_message: "Cancelled by admin",
      })
      .is("finished_at", null);
    if (error) {
      toast.error(`Failed to cancel: ${error.message}`);
    } else {
      toast.success(`Cancelled ${runningCount} run${runningCount === 1 ? "" : "s"}`);
      void load();
    }
  }, [hasRunning, runningCount, load]);

  if (!ready) return null;

  return (
    <AppShell>
      <PageHeader
        title="Bokun import runs"
        subtitle="History of scheduled and manual Bokun syncs"
        actions={
          <div className="flex gap-2">
            {hasRunning && (
              <Button variant="outline" size="sm" onClick={() => void cancelRunning()}>
                <XCircle className="h-4 w-4 mr-2" />
                Cancel running ({runningCount})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="space-y-3">
        {runs.length === 0 && !loading && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No import runs yet.
          </Card>
        )}

        {runs.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {r.success ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                  <div className="font-semibold text-sm">{fmt(r.started_at)}</div>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {r.trigger}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Range: <span className="font-mono">{r.from_date}</span> →{" "}
                  <span className="font-mono">{r.to_date}</span> · Duration:{" "}
                  {duration(r.started_at, r.finished_at)}
                </div>
              </div>

              <div className="flex gap-4 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Seen
                  </div>
                  <div className="font-semibold">{r.total_seen}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Created
                  </div>
                  <div className="font-semibold text-success">{r.created}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Skipped
                  </div>
                  <div className="font-semibold text-muted-foreground">{r.skipped}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Errors
                  </div>
                  <div
                    className={`font-semibold ${
                      r.errors?.length ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {r.errors?.length ?? 0}
                  </div>
                </div>
              </div>
            </div>

            {(() => {
              const pct = progressPct(r);
              if (pct === null) return null;
              const running = !r.finished_at;
              return (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                    <span>
                      {running ? "Importing…" : "Complete"}
                      {r.total_hits != null && (
                        <span className="ml-2 font-mono">
                          {r.total_seen}/{r.total_hits}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all ${running ? "bg-primary" : r.errors?.length ? "bg-destructive" : "bg-success"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {r.error_message && (
              <div className="mt-3 p-2 rounded bg-destructive/10 text-destructive text-xs font-mono">
                {r.error_message}
              </div>
            )}

            {r.errors && r.errors.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Show {r.errors.length} error log{r.errors.length === 1 ? "" : "s"}
                </summary>
                <div className="mt-2 space-y-1 max-h-64 overflow-auto">
                  {r.errors.map((e, i) => (
                    <div
                      key={i}
                      className="p-2 rounded bg-muted text-xs font-mono break-all"
                    >
                      {e}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
