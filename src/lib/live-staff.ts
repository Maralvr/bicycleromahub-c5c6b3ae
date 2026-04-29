import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LiveStaff = {
  id: string;
  profile_id: string | null;
  name: string;
  avatar: string;
  role: "guide" | "rental" | "mechanic" | "admin";
  status: "available" | "on_shift" | "off";
  phone: string | null;
  email: string | null;
  tags: string[];
  languages: string[];
  licenses: string[];
  active: boolean;
};

/**
 * Reads all rows from public.staff. Each auth user has a corresponding
 * staff row (created by the on_auth_user_created_staff trigger).
 */
export function useLiveStaff() {
  const [staff, setStaff] = useState<LiveStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("staff")
      .select("id, profile_id, name, avatar, role, status, phone, email, tags, languages, licenses, active")
      .order("name", { ascending: true });
    if (error) setError(error.message);
    else {
      setStaff((data ?? []) as LiveStaff[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return { staff, loading, error, refresh: fetchAll };
}
