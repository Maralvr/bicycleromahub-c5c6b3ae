// Admin-only user management edge function.
// Verifies the caller has the 'admin' app_role, then performs privileged actions
// using the service-role client (bypasses RLS, can touch auth.users).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | { type: "delete"; userId: string }
  | { type: "ban"; userId: string; durationHours?: number }
  | { type: "unban"; userId: string }
  | { type: "set_active"; userId: string; active: boolean }
  | { type: "set_staff_role"; userId: string; role: "guide" | "rental" | "mechanic" | "admin" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // 1. Verify caller is authenticated and is an admin
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");
    if (!roleRows || roleRows.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const action = (await req.json()) as Action;

    // Prevent admins from deleting/banning themselves accidentally
    if (
      ("userId" in action) &&
      action.userId === user.id &&
      (action.type === "delete" || action.type === "ban")
    ) {
      return new Response(JSON.stringify({ error: "You can't perform this action on your own account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (action.type) {
      case "delete": {
        const { error } = await admin.auth.admin.deleteUser(action.userId);
        if (error) throw error;
        // profiles/staff/user_roles are cleaned up as their tables allow (no FK to auth.users on most),
        // so we explicitly cascade here:
        await admin.from("user_roles").delete().eq("user_id", action.userId);
        await admin.from("profiles").delete().eq("id", action.userId);
        await admin.from("staff").delete().eq("profile_id", action.userId);
        break;
      }
      case "ban": {
        const hours = action.durationHours ?? 24 * 365 * 10; // ~10y default
        const { error } = await admin.auth.admin.updateUserById(action.userId, {
          ban_duration: `${hours}h`,
        });
        if (error) throw error;
        break;
      }
      case "unban": {
        const { error } = await admin.auth.admin.updateUserById(action.userId, {
          ban_duration: "none",
        });
        if (error) throw error;
        break;
      }
      case "set_active": {
        const { error } = await admin
          .from("staff")
          .update({ active: action.active })
          .eq("profile_id", action.userId);
        if (error) throw error;
        break;
      }
      case "set_staff_role": {
        const { error } = await admin
          .from("staff")
          .update({ role: action.role })
          .eq("profile_id", action.userId);
        if (error) throw error;
        break;
      }
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
