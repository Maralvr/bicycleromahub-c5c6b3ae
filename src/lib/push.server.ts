// Server-only Web Push helper using WebCrypto (works on Cloudflare Workers).
// Sends VAPID-signed pushes WITHOUT payload encryption (empty body) — the
// service worker shows a generic notification + deep-links into the app.
// This keeps the implementation small while still waking the device.

// Base64URL helpers
function b64uToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64u(b: ArrayBuffer | Uint8Array): string {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function jsonToB64u(obj: unknown): string {
  return bytesToB64u(new TextEncoder().encode(JSON.stringify(obj)));
}

let cachedKey: { key: CryptoKey; publicKeyB64u: string } | null = null;

async function getVapidSigningKey(): Promise<{ key: CryptoKey; publicKeyB64u: string }> {
  if (cachedKey) return cachedKey;
  const privateB64u = process.env.VAPID_PRIVATE_KEY;
  const publicB64u = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  if (!privateB64u || !publicB64u) {
    throw new Error("VAPID keys not configured (VAPID_PRIVATE_KEY and VITE_VAPID_PUBLIC_KEY required).");
  }
  // public key is uncompressed: 0x04 || x(32) || y(32)
  const pubBytes = b64uToBytes(publicB64u);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error("VAPID public key must be 65 bytes uncompressed (starts with 0x04).");
  }
  const x = bytesToB64u(pubBytes.slice(1, 33));
  const y = bytesToB64u(pubBytes.slice(33, 65));
  const d = privateB64u;

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, ext: false },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  cachedKey = { key, publicKeyB64u: publicB64u };
  return cachedKey;
}

async function signVapidJwt(audience: string): Promise<{ jwt: string; publicKeyB64u: string }> {
  const { key, publicKeyB64u } = await getVapidSigningKey();
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12h
    sub: subject.startsWith("mailto:") || subject.startsWith("http") ? subject : `mailto:${subject}`,
  };
  const signingInput = `${jsonToB64u(header)}.${jsonToB64u(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return { jwt: `${signingInput}.${bytesToB64u(sig)}`, publicKeyB64u };
}

export type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type SendPushResult = {
  endpoint: string;
  status: number;
  ok: boolean;
  expired: boolean;
  error?: string;
};

/**
 * Send a wake-up push to a single subscription endpoint.
 * Returns status; if `expired` is true, the caller should delete the subscription row.
 */
export async function sendPushToSubscription(sub: PushSubscriptionRow): Promise<SendPushResult> {
  try {
    const audience = new URL(sub.endpoint).origin;
    const { jwt, publicKeyB64u } = await signVapidJwt(audience);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${publicKeyB64u}`,
        "Content-Length": "0",
        TTL: "86400",
        Urgency: "normal",
      },
    });
    const expired = res.status === 404 || res.status === 410;
    return {
      endpoint: sub.endpoint,
      status: res.status,
      ok: res.ok,
      expired,
      error: res.ok ? undefined : await res.text().catch(() => undefined),
    };
  } catch (e) {
    return {
      endpoint: sub.endpoint,
      status: 0,
      ok: false,
      expired: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Send a wake-up push to every active subscription for one staff member.
 * Cleans up expired (404/410) subscriptions automatically.
 */
export async function sendPushToStaffId(
  staffId: string,
): Promise<{ sent: number; failed: number; expired: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("staff_id", staffId);
  if (error || !subs || subs.length === 0) {
    return { sent: 0, failed: 0, expired: 0 };
  }
  const results = await Promise.all(subs.map((s) => sendPushToSubscription(s)));
  const expiredIds = results
    .map((r, i) => (r.expired ? subs[i].id : null))
    .filter((id): id is string => !!id);
  if (expiredIds.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", expiredIds);
  }
  return {
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.expired).length,
    expired: expiredIds.length,
  };
}

/**
 * Send a wake-up push to every active subscription for one profile id.
 * Use this for non-staff users (e.g. rental_staff) whose push_subscriptions
 * rows may not have a staff_id set.
 */
export async function sendPushToProfileId(
  profileId: string,
): Promise<{ sent: number; failed: number; expired: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profileId);
  if (error || !subs || subs.length === 0) {
    return { sent: 0, failed: 0, expired: 0 };
  }
  const results = await Promise.all(subs.map((s) => sendPushToSubscription(s)));
  const expiredIds = results
    .map((r, i) => (r.expired ? subs[i].id : null))
    .filter((id): id is string => !!id);
  if (expiredIds.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", expiredIds);
  }
  return {
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.expired).length,
    expired: expiredIds.length,
  };
}
