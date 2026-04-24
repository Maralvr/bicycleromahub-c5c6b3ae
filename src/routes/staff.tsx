import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader, StatusPill } from "@/components/page-header";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { staff } from "@/lib/mock-data";
import { Plus, Search, CalendarOff, Phone, Languages as LangIcon, Award, MoreHorizontal } from "lucide-react";
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
  const [filter, setFilter] = useState<"all" | "available" | "on_shift" | "off">("all");

  const counts = {
    all: staff.length,
    available: staff.filter((s) => s.status === "available").length,
    on_shift: staff.filter((s) => s.status === "on_shift").length,
    off: staff.filter((s) => s.status === "off").length,
  };

  const filtered = staff.filter((s) => {
    const matchesQ = [s.name, ...s.tags, ...s.languages, s.role].join(" ").toLowerCase().includes(q.toLowerCase());
    const matchesFilter = filter === "all" || s.status === filter;
    return matchesQ && matchesFilter;
  });

  const filterTabs: { key: typeof filter; label: string }[] = [
    { key: "all", label: t.common.all },
    { key: "available", label: t.staff.availableNow },
    { key: "on_shift", label: t.staff.onShift },
    { key: "off", label: t.staff.offDuty },
  ];

  return (
    <AppShell>
      <PageHeader
        title={t.staff.title}
        subtitle={t.staff.subtitle}
        actions={
          <Button onClick={() => toast.success("Staff form would open here")} className="shadow-[var(--shadow-elegant)]">
            <Plus className="h-4 w-4 mr-1" /> {t.staff.addStaff}
          </Button>
        }
      />

      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.staff.searchPlaceholder} className="pl-9 h-10 bg-card" />
        </div>
        <div className="flex gap-1 p-1 bg-muted rounded-lg overflow-x-auto">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 h-8 text-xs font-medium rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
                filter === tab.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className="text-[10px] text-muted-foreground bg-background/60 rounded px-1">{counts[tab.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((s) => (
          <Card key={s.id} className="p-5 border-border/60 hover:border-primary/30 hover:shadow-[var(--shadow-card)] transition-all relative overflow-hidden group">
            <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-primary/5 to-transparent rounded-full -mr-8 -mt-8 group-hover:from-primary/10 transition-colors" />

            <div className="flex items-start gap-4 relative">
              <Avatar name={s.name} initials={s.avatar} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{s.name}</h3>
                    <div className="text-xs text-muted-foreground capitalize">{s.role}</div>
                  </div>
                  <button className="text-muted-foreground hover:text-foreground p-1 -m-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <StatusPill status={s.status} />
                  <a href={`tel:${s.phone}`} className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 truncate">
                    <Phone className="h-3 w-3 flex-shrink-0" /> {s.phone}
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-xs relative">
              <div>
                <div className="text-muted-foreground mb-1.5 font-semibold uppercase tracking-wider text-[10px]">{t.common.tags}</div>
                <div className="flex flex-wrap gap-1">
                  {s.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="font-normal text-[10px] bg-primary/10 text-foreground border-0 hover:bg-primary/15">{tag}</Badge>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="text-muted-foreground mb-1 font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <LangIcon className="h-2.5 w-2.5" /> {t.common.languages}
                  </div>
                  <div className="font-medium text-foreground/90">{s.languages.join(" · ")}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1 font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <Award className="h-2.5 w-2.5" /> {t.common.licenses}
                  </div>
                  <div className="font-medium text-foreground/90">{s.licenses.join(", ")}</div>
                </div>
              </div>

              {s.unavailability.length > 0 && (
                <div className="pt-2 mt-2 border-t border-border/60">
                  <div className="text-muted-foreground mb-1 font-semibold uppercase tracking-wider text-[10px]">{t.common.availability}</div>
                  {s.unavailability.map((u, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-foreground/70">
                      <CalendarOff className="h-3 w-3 text-warning-foreground" />
                      <span className="font-medium">{u.date}</span>
                      <span className="text-muted-foreground">{u.allDay ? "all day" : `${u.from}–${u.to}`}</span>
                      {u.reason && <span className="text-muted-foreground">· {u.reason}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4 pt-4 border-t border-border/60 relative">
              <Button variant="outline" size="sm" className="flex-1 h-8" onClick={() => toast("Profile editor would open")}>
                {t.common.edit}
              </Button>
              <Button variant="outline" size="sm" className="flex-1 h-8" onClick={() => toast("Add unavailability dialog")}>
                <CalendarOff className="h-3.5 w-3.5 mr-1" /> {t.staff.addUnavailability}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
