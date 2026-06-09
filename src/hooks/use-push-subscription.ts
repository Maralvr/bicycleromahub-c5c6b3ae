import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  registerPushSubscription,
  unregisterPushSubscription,
  sendTestPush,
} from "@/lib/push.functions";

const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "";
const SW_URL = "/sw.js";

// Convert base64url public key → Uint8Array for PushManager
function urlBase64ToUint8Array(b64u: string): Uint8Array {
  const pad = "=".repeat((4 - (b64u.length % 4)) % 4);
  const base64 = (b64u + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function subscriptionToPayload(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
}

export type PushStatus =
  | "unsupported" // browser/env doesn't support push
  | "blocked" // permission denied
  | "idle" // supported but not subscribed
  | "subscribed" // active subscription
  | "loading"; // in-flight

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const register = useServerFn(registerPushSubscription);
  const unregister = useServerFn(unregisterPushSubscription);
  const sendTest = useServerFn(sendTestPush);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    !!VAPID_PUBLIC;

  const refresh = useCallback(async () => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      if (!reg) {
        setStatus(Notification.permission === "denied" ? "blocked" : "idle");
        setEndpoint(null);
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setEndpoint(sub.endpoint);
        setStatus("subscribed");
      } else {
        setEndpoint(null);
        setStatus(Notification.permission === "denied" ? "blocked" : "idle");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  }, [supported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    if (!supported) return;
    setStatus("loading");
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "blocked" : "idle");
        return;
      }
      let reg = await navigator.serviceWorker.getRegistration(SW_URL);
      if (!reg) {
        reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
      }
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        });
      }
      await register({ data: subscriptionToPayload(sub) });
      setEndpoint(sub.endpoint);
      setStatus("subscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  }, [register, supported]);

  const disable = useCallback(async () => {
    if (!supported) return;
    setStatus("loading");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const ep = sub.endpoint;
        await sub.unsubscribe().catch(() => undefined);
        await unregister({ data: { endpoint: ep } }).catch(() => undefined);
      }
      setEndpoint(null);
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [unregister, supported]);

  const test = useCallback(async () => {
    return await sendTest({});
  }, [sendTest]);

  return { status, supported, endpoint, error, subscribe, disable, test, refresh };
}
