(() => {
  if (window.__familyAppUpdateInstalled) return;
  window.__familyAppUpdateInstalled = true;

  const CONFIG_URL = "config.js";
  const SERVICE_WORKER_URL = "service-worker.js";
  const CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const MIN_CHECK_GAP_MS = 20 * 1000;
  const RELOAD_GUARD_PREFIX = "family-app-update-reloaded:";

  let checking = false;
  let lastCheckedAt = 0;
  let reloadScheduled = false;
  const hadControllerAtStart = Boolean(navigator.serviceWorker?.controller);

  const moduleSignatureFromSource = (source) => {
    const modules = [];
    const pattern = /\{\s*name:\s*["']([^"']+)["']\s*,\s*version:\s*["']([^"']+)["']/g;
    let match;
    while ((match = pattern.exec(source))) modules.push(`${match[1]}@${match[2]}`);
    return modules.join("|");
  };

  const compactHash = (value) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };

  const scheduleReload = (signature) => {
    if (reloadScheduled) return;
    const versionKey = compactHash(signature || String(Date.now()));
    const guardKey = `${RELOAD_GUARD_PREFIX}${versionKey}`;
    try {
      if (sessionStorage.getItem(guardKey)) return;
      sessionStorage.setItem(guardKey, "1");
    } catch { /* 세션 저장이 막혀도 한 번은 갱신 */ }

    reloadScheduled = true;
    if (typeof toast === "function") toast("새 버전을 적용하고 있어요… 🔄");

    window.setTimeout(() => {
      const target = new URL(window.location.href);
      target.searchParams.set("__appv", versionKey);
      window.location.replace(target.href);
    }, 350);
  };

  const checkConfigVersion = async ({ force = false } = {}) => {
    if (checking || reloadScheduled || !navigator.onLine) return;
    const now = Date.now();
    if (!force && now - lastCheckedAt < MIN_CHECK_GAP_MS) return;

    checking = true;
    lastCheckedAt = now;
    try {
      const requestUrl = new URL(CONFIG_URL, window.location.href);
      requestUrl.searchParams.set("update-check", String(now));
      const response = await fetch(requestUrl.href, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) return;

      const freshSignature = moduleSignatureFromSource(await response.text());
      const currentSignature = String(window.FAMILY_MODULE_SIGNATURE || "");
      if (freshSignature && currentSignature && freshSignature !== currentSignature) {
        scheduleReload(freshSignature);
      }
    } catch (error) {
      console.debug("앱 버전 확인을 건너뛰었어요", error);
    } finally {
      checking = false;
    }
  };

  const registerUpdateWorker = async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
        scope: "./",
        updateViaCache: "none",
      });

      const activateWaitingWorker = () => {
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      };

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            activateWaitingWorker();
          }
        });
      });

      activateWaitingWorker();
      await registration.update();
    } catch (error) {
      console.debug("서비스 워커 업데이트 확인을 건너뛰었어요", error);
    }
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadControllerAtStart) scheduleReload(window.FAMILY_MODULE_SIGNATURE || "service-worker");
    });
  }

  const checkNow = () => {
    checkConfigVersion();
    registerUpdateWorker();
  };

  window.addEventListener("pageshow", () => checkConfigVersion({ force: true }));
  window.addEventListener("focus", checkNow);
  window.addEventListener("online", checkNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkNow();
  });

  window.setInterval(() => {
    if (document.visibilityState === "visible") checkConfigVersion();
  }, CHECK_INTERVAL_MS);

  window.setTimeout(() => {
    checkConfigVersion({ force: true });
    registerUpdateWorker();
  }, 1200);
})();
