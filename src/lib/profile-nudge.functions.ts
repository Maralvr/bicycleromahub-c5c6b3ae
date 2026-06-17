import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only: scans every user's profile and sends an in-app notification
 * (plus push, if subscribed) to anyone missing a display name, phone number,
 * or profile photo, asking them to complete their profile.
 */
export const nudgeIncompleteProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, phone, avatar_url, staff_id");
    if (pErr) throw new Error(pErr.message);

    const incomplete = (profiles ?? []).filter((p) => {
      const noName = !p.display_name || p.display_name.trim().length < 2;
      const noPhone = !p.phone || p.phone.trim().length < 4;
      const noPhoto = !p.avatar_url;
      return noName || noPhone || noPhoto;
    });
    if (incomplete.length === 0) return { notified: 0, push: { sent: 0, failed: 0, expired: 0 } };

    const profileIds = incomplete.map((p) => p.id);

    // Rental-staff records linked to these profiles
    const { data: rstaff } = await supabaseAdmin
      .from("rental_staff")
      .select("id, profile_id")
      .in("profile_id", profileIds);
    const rstaffByProfile = new Map<string, string>(
      (rstaff ?? []).map((r) => [r.profile_id!, r.id]),
    );

    const title = "Please complete your profile";
    const body = "Add your name, phone and photo so the team can recognise and reach you.";
    const link = "/profile";

    let notified = 0;

    for (const p of incomplete) {
      const missing: string[] = [];
      if (!p.display_name || p.display_name.trim().length < 2) missing.push("name");
      if (!p.phone || p.phone.trim().length < 4) missing.push("phone");
      if (!p.avatar_url) missing.push("photo");
      const personalBody = `Missing: ${missing.join(", ")}. ${body}`;

      if (p.staff_id) {
        await supabaseAdmin.from("guide_notifications").insert({
          staff_id: p.staff_id,
          type: "reassigned",
          title,
          body: personalBody,
          link,
          read: false,
        });
        notified++;
      } else if (rstaffByProfile.has(p.id)) {
        await supabaseAdmin.from("rental_staff_notifications").insert({
          rental_staff_id: rstaffByProfile.get(p.id)!,
          type: "assigned",
          title,
          body: personalBody,
          link,
        });
        notified++;
      }
    }

    // Push (best effort)
    const { sendPushToProfileId } = await import("@/lib/push.server");
    const results = await Promise.all(profileIds.map((id) => sendPushToProfileId(id)));
    const push = results.reduce(
      (acc, r) => ({ sent: acc.sent + r.sent, failed: acc.failed + r.failed, expired: acc.expired + r.expired }),
      { sent: 0, failed: 0, expired: 0 },
    );

    return { notified, push, scanned: profiles?.length ?? 0 };
  });
