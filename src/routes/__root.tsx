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
import { AdditionalGuidesStoreProvider } from "@/lib/additional-guides-store";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

const PUBLIC_ROUTES = ["/auth", "/reset-password"];
const RENTAL_ROUTES = ["/shifts", "/rental-points", "/profile", "/staff", "/notifications", "/tasks"];

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
      { title: "Bicycle Roma — Operations Hub" },
      {
        name: "description",
        content: "Staff scheduling, Bokun shifts, tasks and field comms for Bicycle Roma.",
      },
      { name: "author", content: "Bicycle Roma" },
      { property: "og:title", content: "Bicycle Roma — Operations Hub" },
      {
        property: "og:description",
        content: "Staff scheduling, Bokun shifts, tasks and field comms for Bicycle Roma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Bicycle Roma — Operations Hub" },
      {
        name: "description",
        content: "Shift Savvy automates tour operator staff scheduling and management.",
      },
      {
        property: "og:description",
        content: "Shift Savvy automates tour operator staff scheduling and management.",
      },
      {
        name: "twitter:description",
        content: "Shift Savvy automates tour operator staff scheduling and management.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7763325a-585a-4f76-8aca-524635142423/id-preview-51fc2747--d10b7846-1048-4145-87e5-4eabec45c97d.lovable.app-1778237671422.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7763325a-585a-4f76-8aca-524635142423/id-preview-51fc2747--d10b7846-1048-4145-87e5-4eabec45c97d.lovable.app-1778237671422.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/pwa-192x192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
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
  const { loading, isAuthenticated, rolesLoaded, isRentalStaff, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isPublic = PUBLIC_ROUTES.some((p) => location.pathname.startsWith(p));
  const isRentalAllowed = RENTAL_ROUTES.some((p) => location.pathname.startsWith(p));

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated && !isPublic) {
      void navigate({ to: "/auth", search: { redirect: location.pathname } });
      return;
    }
    if (
      isAuthenticated &&
      rolesLoaded &&
      isRentalStaff &&
      !isAdmin &&
      !isPublic &&
      !isRentalAllowed
    ) {
      void navigate({ to: "/shifts", replace: true });
    }
  }, [loading, isAuthenticated, rolesLoaded, isRentalStaff, isAdmin, isPublic, isRentalAllowed, location.pathname, navigate]);

  if (loading || (isAuthenticated && !rolesLoaded && !isPublic)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <div className="h-8 w-8 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
        <p className="text-sm">Loading…</p>
      </div>
    );
  }
  if (!isAuthenticated && !isPublic) return null;
  if (isAuthenticated && rolesLoaded && isRentalStaff && !isAdmin && !isPublic && !isRentalAllowed) return null;
  return <>{children}</>;
}

function RootComponent() {
  const location = useLocation();
  const isResetPassword = location.pathname.startsWith("/reset-password");

  return (
    <I18nProvider>
      {isResetPassword ? (
        <>
          <Outlet />
          <Toaster />
        </>
      ) : (
        <AuthProvider>
          <AuthenticatedDataProviders>
            <AuthGate>
              <Outlet />
              <Toaster />
            </AuthGate>
          </AuthenticatedDataProviders>
        </AuthProvider>
      )}
    </I18nProvider>
  );
}

function AuthenticatedDataProviders({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, rolesLoaded, isRentalStaff, isAdmin } = useAuth();

  if (!isAuthenticated || loading || !rolesLoaded) {
    return <>{children}</>;
  }

  if (isRentalStaff && !isAdmin) {
    return <>{children}</>;
  }

  return (
    <StaffStoreProvider>
      <CurrentUserProvider>
        <ShiftsStoreProvider>
          <AdditionalGuidesStoreProvider>
            <NotesStoreProvider>
              <TasksStoreProvider>
                <TaskUpdatesStoreProvider>{children}</TaskUpdatesStoreProvider>
              </TasksStoreProvider>
            </NotesStoreProvider>
          </AdditionalGuidesStoreProvider>
        </ShiftsStoreProvider>
      </CurrentUserProvider>
    </StaffStoreProvider>
  );
}
