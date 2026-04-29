import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CurrentUserProvider } from "@/lib/current-user";
import { StaffStoreProvider } from "@/lib/staff-store";
import { NotesStoreProvider } from "@/lib/notes-store";
import { TaskUpdatesStoreProvider } from "@/lib/task-updates-store";
import { TasksStoreProvider } from "@/lib/tasks-store";
import { ShiftsStoreProvider } from "@/lib/shifts-store";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

const PUBLIC_ROUTES = ["/auth", "/reset-password"];

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "eBicycle Roma — Operations Hub" },
      {
        name: "description",
        content: "Staff scheduling, Bokun shifts, tasks and field comms for eBicycle Roma.",
      },
      { name: "author", content: "eBicycle Roma" },
      { property: "og:title", content: "eBicycle Roma — Operations Hub" },
      {
        property: "og:description",
        content: "Staff scheduling, Bokun shifts, tasks and field comms for eBicycle Roma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/jpeg", href: "/favicon.jpg" },
      { rel: "apple-touch-icon", href: "/favicon.jpg" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isPublic = PUBLIC_ROUTES.some((p) => location.pathname.startsWith(p));

  useEffect(() => {
    if (!loading && !isAuthenticated && !isPublic) {
      void navigate({ to: "/auth", search: { redirect: location.pathname } });
    }
  }, [loading, isAuthenticated, isPublic, location.pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!isAuthenticated && !isPublic) return null;
  return <>{children}</>;
}

function RootComponent() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AuthGate>
          <StaffStoreProvider>
            <CurrentUserProvider>
              <ShiftsStoreProvider>
                <NotesStoreProvider>
                  <TasksStoreProvider>
                    <TaskUpdatesStoreProvider>
                      <Outlet />
                      <Toaster />
                    </TaskUpdatesStoreProvider>
                  </TasksStoreProvider>
                </NotesStoreProvider>
              </ShiftsStoreProvider>
            </CurrentUserProvider>
          </StaffStoreProvider>
        </AuthGate>
      </AuthProvider>
    </I18nProvider>
  );
}
