import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "./auth";

/**
 * Client-side admin guard. Place at the top of an admin-only page component.
 * Redirects non-admins to /shifts (their default workspace).
 * Note: real authorization is enforced server-side via RLS + has_role().
 */
export function useRequireAdmin() {
  const { loading, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) return; // root AuthGate handles this
    if (!isAdmin) {
      void navigate({ to: "/shifts", replace: true });
    }
  }, [loading, isAuthenticated, isAdmin, navigate]);

  return { ready: !loading && isAuthenticated && isAdmin };
}

/** Allows admins and rental_staff users (rental-points view). */
export function useRequireAdminOrRental() {
  const { loading, isAuthenticated, isAdmin, isRentalStaff } = useAuth();
  const navigate = useNavigate();
  const allowed = isAdmin || isRentalStaff;

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) return;
    if (!allowed) {
      void navigate({ to: "/shifts", replace: true });
    }
  }, [loading, isAuthenticated, allowed, navigate]);

  return { ready: !loading && isAuthenticated && allowed };
}
