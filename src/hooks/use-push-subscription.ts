import { useCallback, useEffect, useMemo, useState } from "react";
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

// Race a promise against a timeout so the UI never gets stuck when the
// underlying browser API (permission prompt, SW registration, push subscribe)
// never resolves — this happens e.g. inside the Lovable preview iframe on
// mobile, or on iOS Safari when the app hasn't been added to Home Screen.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const register = useServerFn(registerPushSubscription);
  const unregister = useServerFn(unregisterPushSubscription);
  const sendTest = useServerFn(sendTestPush);

  // Environmental gotchas that make push impossible or unreliable on mobile.
  const env = useMemo(() => {
    if (typeof window === "undefined") {
      return { inIframe: false, isIOS: false, isStandalone: false };
    }
    const inIframe = window.self !== window.top;
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS-specific
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    return { inIframe, isIOS, isStandalone };
  }, []);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC &&
    // iOS only supports web push from an installed PWA (Home Screen).
    !(env.isIOS && !env.isStandalone) &&
    // Lovable preview / any cross-origin iframe blocks the permission prompt.
    !env.inIframe;

  const unsupportedReason = !supported
    ? env.inIframe
      ? "Open the app in a full browser tab (not the in-app preview) to enable push."
      : env.isIOS && !env.isStandalone
        ? "On iPhone/iPad, add this app to your Home Screen first, then open it from there to enable push."
        : !VAPID_PUBLIC
          ? "Push isn't configured for this environment."
          : "This browser doesn't support push notifications."
    : null;

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
    let succeeded = false;
    try {
      // Permission prompt — some browsers (or iframes) never resolve this.
      const perm = await withTimeout(
        Promise.resolve(Notification.requestPermission()),
        20_000,
        "Permission prompt",
      );
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "blocked" : "idle");
        return;
      }
      let reg = await navigator.serviceWorker.getRegistration(SW_URL);
      if (!reg) {
        reg = await withTimeout(
          navigator.serviceWorker.register(SW_URL, { scope: "/" }),
          15_000,
          "Service worker registration",
        );
      }
      await withTimeout(navigator.serviceWorker.ready, 15_000, "Service worker activation");
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const appKey = urlBase64ToUint8Array(VAPID_PUBLIC);
        sub = await withTimeout(
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appKey.buffer.slice(
              appKey.byteOffset,
              appKey.byteOffset + appKey.byteLength,
            ) as ArrayBuffer,
          }),
          20_000,
          "Push subscribe",
        );
      }
      await register({ data: subscriptionToPayload(sub) });
      setEndpoint(sub.endpoint);
      setStatus("subscribed");
      succeeded = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      // Guarantee we never leave the UI stuck on "loading".
      if (!succeeded) {
        setStatus(
          typeof Notification !== "undefined" && Notification.permission === "denied"
            ? "blocked"
            : "idle",
        );
      }
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
      setStatus("idle");
    }
  }, [unregister, supported]);

  const test = useCallback(async () => {
    return await sendTest({});
  }, [sendTest]);

  return {
    status,
    supported,
    unsupportedReason,
    endpoint,
    error,
    subscribe,
    disable,
    test,
    refresh,
  };
}
