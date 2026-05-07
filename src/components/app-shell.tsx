import { Link, useLocation } from "@tanstack/react-router";
import { ReactNode } from "react";
import { LayoutDashboard, Users, CalendarRange, CalendarDays, ListChecks, Bell, Languages, UserCog, MapPin, Zap, LogOut } from "lucide-react";
import logo from "@/assets/logo.jpg";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/current-user";
import { useStaffStore } from "@/lib/staff-store";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notification-bell";

export function AppShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { role, setRole, staffId, setStaffId, displayName, initials, subtitle } = useCurrentUser();
  const { staff } = useStaffStore();
  const location = useLocation();
  const { signOut } = useAuth();

  const nav = role === "staff"
    ? [
        { to: "/shifts", label: t.nav.myShifts, icon: CalendarRange },
        { to: "/staff", label: t.nav.myAvailability, icon: Users },
        { to: "/tasks", label: t.nav.tasks, icon: ListChecks },
        { to: "/notifications", label: t.nav.notifications, icon: Bell },
      ]
    : [
        { to: "/", label: t.nav.dashboard, icon: LayoutDashboard },
        { to: "/staff", label: t.nav.staff, icon: Users },
        { to: "/rental-points", label: "Rental points", icon: MapPin },
        { to: "/shifts", label: t.nav.shifts, icon: CalendarRange },
        { to: "/live-shifts", label: "Live shifts", icon: Zap },
        { to: "/calendar", label: t.nav.calendar, icon: CalendarDays },
        { to: "/tasks", label: t.nav.tasks, icon: ListChecks },
        { to: "/notifications", label: t.nav.notifications, icon: Bell },
      ];

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border/60 bg-card/60 backdrop-blur-sm sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border/60">
          <div className="relative">
            <img src={logo} alt="eBicycle Roma" className="h-12 w-12 rounded-xl object-contain bg-white ring-1 ring-border shadow-sm" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-card" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-foreground leading-tight tracking-tight">{t.appName}</div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-[0.15em]">{t.tagline}</div>
          </div>
          {role === "staff" && staffId && <NotificationBell staffId={staffId} />}
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <div className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
            {role === "staff" ? "My workspace" : "Workspace"}
          </div>
          {nav.map((item) => {
            const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-elegant)]"
                    : "text-foreground/70 hover:bg-accent hover:text-foreground"
                )}
              >
                {active && <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary" />}
                <Icon className={cn("h-4 w-4 transition-transform", active ? "scale-110" : "group-hover:scale-110")} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border/60 space-y-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold px-1 mb-1.5">
              <Languages className="h-3 w-3" /> Language
            </div>
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {(["en", "it"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={cn(
                    "flex-1 h-7 text-xs font-semibold rounded-md transition-all",
                    lang === l ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold px-1 mb-1.5">
              <UserCog className="h-3 w-3" /> View as
            </div>
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {(["admin", "staff"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex-1 h-7 text-xs font-semibold rounded-md transition-all",
                    role === r ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r === "admin" ? "Admin" : "Guide"}
                </button>
              ))}
            </div>
            {role === "staff" && (
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="mt-2 w-full h-8 text-xs rounded-md bg-card border border-border px-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.role}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-gradient-to-br from-primary/10 to-transparent border border-primary/15">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground flex items-center justify-center text-[11px] font-bold">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">{displayName}</div>
              <div className="text-[10px] text-muted-foreground truncate capitalize">{subtitle}</div>
            </div>
            <button
              onClick={() => void signOut()}
              title="Sign out"
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-20 glass border-b border-border/60">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <img src={logo} alt="" className="h-9 w-9 rounded-lg object-contain bg-white ring-1 ring-border" />
              <div>
                <div className="font-bold text-sm leading-tight">{t.appName}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.tagline}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {role === "staff" && staffId && <NotificationBell staffId={staffId} />}
              <div className="flex gap-1 p-0.5 bg-muted rounded-md">
                {(["en", "it"] as const).map((l) => (
                  <button key={l} onClick={() => setLang(l)} className={cn("h-6 px-2 text-[10px] font-semibold rounded", lang === l ? "bg-card shadow-sm" : "text-muted-foreground")}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
              <button
                onClick={() => void signOut()}
                title="Sign out"
                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <nav className="flex overflow-x-auto px-2 gap-1 pb-1.5">
            {nav.map((item) => {
              const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link key={item.to} to={item.to} className={cn("flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="flex-1 p-5 md:p-10 overflow-x-hidden max-w-[1400px] w-full">{children}</main>
      </div>
    </div>
  );
}
