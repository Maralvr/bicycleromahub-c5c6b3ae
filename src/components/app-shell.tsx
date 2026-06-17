import { Link, useLocation } from "@tanstack/react-router";
import { ReactNode, useState } from "react";
import { LayoutDashboard, Users, CalendarRange, CalendarDays, ListChecks, Bell, Languages, UserCog, MapPin, Zap, LogOut, ShieldCheck, RefreshCw, Euro, History, ArrowLeftRight, MoreHorizontal } from "lucide-react";
import logo from "@/assets/logo.png";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/current-user";
import { useStaffStore } from "@/lib/staff-store";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notification-bell";
import { RentalNotificationBell } from "@/components/rental-notification-bell";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";


export function AppShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { role, setRole, staffId, setStaffId, displayName, initials, subtitle } = useCurrentUser();
  const { staff } = useStaffStore();
  const location = useLocation();
  const { signOut, isAdmin, isRentalStaff, profile } = useAuth();
  const switchView = () => setRole(role === "admin" ? "staff" : "admin");

  const nav = role === "staff"
    ? [
        { to: "/shifts", label: t.nav.myShifts, icon: CalendarRange },
        { to: "/staff", label: t.nav.myAvailability, icon: Users },
        ...(isRentalStaff ? [{ to: "/rental-points", label: t.nav.rentalPoints, icon: MapPin }] : []),
        { to: "/notifications", label: t.nav.notifications, icon: Bell },
        { to: "/tasks", label: t.nav.tasks, icon: ListChecks },
      ]
    : [
        { to: "/", label: t.nav.dashboard, icon: LayoutDashboard },
        { to: "/staff", label: t.nav.staff, icon: Users },
        { to: "/rental-points", label: t.nav.rentalPoints, icon: MapPin },
        { to: "/shifts", label: t.nav.shifts, icon: CalendarRange },
        { to: "/live-shifts", label: t.nav.liveShifts, icon: Zap },
        
        { to: "/payouts", label: t.nav.payouts, icon: Euro },
        { to: "/notifications", label: t.nav.notifications, icon: Bell },
        { to: "/tasks", label: t.nav.tasks, icon: ListChecks },
        { to: "/bokun-runs", label: t.nav.bokunRuns, icon: RefreshCw },
        { to: "/dispatch-log", label: t.nav.dispatchLog, icon: History },
        { to: "/users", label: t.nav.users, icon: ShieldCheck },
      ];

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border/60 bg-card/60 backdrop-blur-sm sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border/60">
          <div className="relative">
            <img src={logo} alt="Bicycle Roma" className="h-12 w-12 rounded-xl object-contain bg-white ring-1 ring-border shadow-sm" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-card" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-foreground leading-tight tracking-tight">{t.appName}</div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-[0.15em]">{t.tagline}</div>
          </div>
          {isRentalStaff ? <RentalNotificationBell /> : staffId && <NotificationBell staffId={staffId} />}
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <div className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
            {role === "staff" ? t.shell.myWorkspace : t.shell.workspace}
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
              <Languages className="h-3 w-3" /> {t.shell.language}
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

          {role === "staff" && isAdmin && (
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold px-1 mb-1.5">
                <UserCog className="h-3 w-3" /> {t.shell.actingAs}
              </div>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full h-8 text-xs rounded-md bg-card border border-border px-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.role}
                  </option>
                ))}
              </select>
            </div>
          )}


          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-gradient-to-br from-primary/10 to-transparent border border-primary/15">
            <Link
              to="/profile"
              className="flex items-center gap-2.5 min-w-0 flex-1 group"
              title="Edit my profile"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="h-8 w-8 rounded-full object-cover ring-1 ring-border group-hover:ring-primary/50 transition"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground flex items-center justify-center text-[11px] font-bold">
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1 text-left">
                <div className="text-xs font-semibold truncate group-hover:text-primary transition-colors">{displayName}</div>
                <div className="text-[10px] text-muted-foreground truncate capitalize">{subtitle}</div>
              </div>
            </Link>
            <button
              onClick={() => void signOut()}
              title={t.shell.signOut}
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
              {isRentalStaff ? <RentalNotificationBell /> : staffId && <NotificationBell staffId={staffId} />}
              <Link
                to="/profile"
                title="Edit my profile"
                className="h-9 w-9 rounded-full overflow-hidden ring-1 ring-border hover:ring-primary/60 transition flex-shrink-0"
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground flex items-center justify-center text-[11px] font-bold">
                    {initials}
                  </div>
                )}
              </Link>
              <div className="flex gap-1 p-0.5 bg-muted rounded-md">
                {(["en", "it"] as const).map((l) => (
                  <button key={l} onClick={() => setLang(l)} className={cn("h-6 px-2 text-[10px] font-semibold rounded", lang === l ? "bg-card shadow-sm" : "text-muted-foreground")}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
              <button
                onClick={() => void signOut()}
                title={t.shell.signOut}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold border border-border bg-card text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 active:scale-95 transition-all"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden xs:inline">{t.shell.signOut}</span>
              </button>
            </div>
          </div>
        </header>
        {isAdmin && (
          <div className="sticky top-0 md:top-0 z-10 flex justify-end px-4 md:px-10 pt-3 md:pt-4">
            <button
              onClick={switchView}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-xs font-semibold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all shadow-sm"
              title={role === "admin" ? t.shell.switchToGuide : t.shell.switchToAdmin}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span>{role === "admin" ? t.shell.switchToGuide : t.shell.switchToAdmin}</span>
            </button>
          </div>
        )}
        <main className="flex-1 p-5 md:p-10 overflow-x-hidden max-w-[1400px] w-full pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-10">
          {children}
        </main>

        {/* Mobile bottom tab bar */}
        <MobileTabBar nav={nav} pathname={location.pathname} />
      </div>
    </div>
  );
}

function MobileTabBar({
  nav,
  pathname,
}: {
  nav: { to: string; label: string; icon: typeof LayoutDashboard }[];
  pathname: string;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = nav.slice(0, 4);
  const overflow = nav.slice(4);
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const overflowActive = overflow.some((i) => isActive(i.to));

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 glass border-t border-border/60 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="grid grid-cols-5 h-16">
        {primary.map((item) => {
          const active = isActive(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors active:scale-95",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "scale-110 transition-transform")} />
              <span className="leading-none truncate max-w-[64px]">{item.label}</span>
              {active && <span className="absolute top-0 h-0.5 w-10 rounded-b-full bg-primary" />}
            </Link>
          );
        })}
        {overflow.length > 0 ? (
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors active:scale-95",
                  overflowActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                aria-label="More"
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="leading-none">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {overflow.map((item) => {
                  const active = isActive(item.to);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-semibold transition-all active:scale-95",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border/60 hover:bg-accent",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-center leading-tight">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <div />
        )}
      </div>
    </nav>
  );
}

