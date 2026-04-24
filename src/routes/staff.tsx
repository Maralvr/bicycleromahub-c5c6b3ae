import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader, StatusPill } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { staff } from "@/lib/mock-data";
import { Plus, Search, CalendarOff, Phone, Languages as LangIcon, Award } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff — eBicycle Roma" },
      { name: "description", content: "Manage staff profiles, tags, languages and availability." },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const filtered = staff.filter((s) =>
    [s.name, ...s.tags, ...s.languages, s.role].join(" ").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <AppShell>
      <PageHeader
        title={t.staff.title}
        subtitle={t.staff.subtitle}
        actions={
          <Button onClick={() => toast.success("Staff form would open here")}>
            <Plus className="h-4 w-4 mr-1" /> {t.staff.addStaff}
          </Button>
        }
      />

      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.staff.searchPlaceholder} className="pl-9" />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((s) => (
          <Card key={s.id} className="p-5">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-primary-foreground font-bold text-lg flex-shrink-0">
                {s.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-foreground truncate">{s.name}</h3>
                  <StatusPill status={s.status} />
                </div>
                <div className="text-xs text-muted-foreground capitalize">{s.role}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Phone className="h-3 w-3" /> {s.phone}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div>
                <div className="text-muted-foreground mb-1 font-medium uppercase tracking-wide text-[10px]">{t.common.tags}</div>
                <div className="flex flex-wrap gap-1">
                  {s.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="font-normal">{tag}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4 pt-1">
                <div className="flex items-center gap-1.5 text-foreground/80">
                  <LangIcon className="h-3.5 w-3.5 text-primary" />
                  {s.languages.join(" · ")}
                </div>
                <div className="flex items-center gap-1.5 text-foreground/80">
                  <Award className="h-3.5 w-3.5 text-primary" />
                  {s.licenses.join(", ")}
                </div>
              </div>

              {s.unavailability.length > 0 && (
                <div className="pt-2 mt-2 border-t border-border">
                  <div className="text-muted-foreground mb-1 font-medium uppercase tracking-wide text-[10px]">{t.common.availability}</div>
                  {s.unavailability.map((u, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-foreground/70">
                      <CalendarOff className="h-3 w-3 text-warning-foreground" />
                      {u.date} {u.allDay ? "· all day" : `· ${u.from}–${u.to}`}
                      {u.reason && <span className="text-muted-foreground">· {u.reason}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => toast("Profile editor would open")}>
                {t.common.edit}
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => toast("Add unavailability dialog")}>
                <CalendarOff className="h-3.5 w-3.5 mr-1" /> {t.staff.addUnavailability}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
