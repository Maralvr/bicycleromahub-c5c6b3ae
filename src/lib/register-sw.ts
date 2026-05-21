// Service worker registration with strict guards.
// - Never runs during SSR
// - Never runs inside an iframe (Lovable editor preview)
// - Never runs on Lovable preview hosts
// - Auto-unregisters any existing SW in those contexts to recover from prior installs
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const host = window.location.hostname;
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host.includes("lovable.app") === false && host === "localhost";

  // Unregister any existing SW in unsafe contexts so updates can recover.
  if (isInIframe || host.includes("id-preview--") || host.includes("lovableproject.com")) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
    return;
  }

  if (isPreviewHost) return;

  // Dynamic import so the virtual module is only pulled in the browser bundle.
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      // virtual module not present (e.g. dev) — ignore.
    });
}
