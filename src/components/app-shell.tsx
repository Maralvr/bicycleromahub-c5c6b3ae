import { Link, useLocation } from "@tanstack/react-router";
import { ReactNode } from "react";
import { LayoutDashboard, Users, CalendarRange, ListChecks, Bell, Languages } from "lucide-react";
import logo from "@/assets/logo.jpg";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const location = useLocation();

  const nav = [
    { to: "/", label: t.nav.dashboard, icon: LayoutDashboard },
    { to: "/staff", label: t.nav.staff, icon: Users },
    { to: "/shifts", label: t.nav.shifts, icon: CalendarRange },
    { to: "/tasks", label: t.nav.tasks, icon: ListChecks },
    { to: "/notifications", label: t.nav.notifications, icon: Bell },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <img src={logo} alt="eBicycle Roma" className="h-11 w-11 rounded-lg object-contain bg-white" />
          <div>
            <div className="font-bold text-foreground leading-tight">{t.appName}</div>
            <div className="text-xs text-muted-foreground">{t.tagline}</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-elegant)]"
                    : "text-foreground/70 hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 mb-2">
            <Languages className="h-3.5 w-3.5" /> Language
          </div>
          <div className="flex gap-1">
            {(["en", "it"] as const).map((l) => (
              <Button
                key={l}
                size="sm"
                variant={lang === l ? "default" : "outline"}
                className="flex-1 h-8"
                onClick={() => setLang(l)}
              >
                {l.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" className="h-8 w-8 rounded object-contain bg-white" />
            <span className="font-bold text-sm">{t.appName}</span>
          </div>
          <div className="flex gap-1">
            {(["en", "it"] as const).map((l) => (
              <Button key={l} size="sm" variant={lang === l ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </Button>
            ))}
          </div>
        </header>
        <nav className="md:hidden flex overflow-x-auto border-b border-border bg-card">
          {nav.map((item) => {
            const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={cn("flex-shrink-0 px-4 py-2.5 text-xs font-medium border-b-2", active ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="flex-1 p-4 md:p-8 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
