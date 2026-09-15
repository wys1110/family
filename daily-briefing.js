(() => {
  const STORAGE_KEY = "family-event-change-push-v1";
  const FUNCTION_NAME = "daily-briefing-push";
  const SERVICE_WORKER_URL = "service-worker.js";
  const MANIFEST_URL = "manifest.webmanifest";
  const SUBSCRIPTION_TIME = "09:00";
  const DEFAULT_TIMEZONE = "Asia/Seoul";
  const demoMode = window.FAMILY_DEMO_MODE === true;

  const resolvedTimezone = () => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE; }
    catch { return DEFAULT_TIMEZONE; }
  };

  const scopedStorageKey = () => {
    if (typeof state !== "undefined" && state.session?.user?.id && state.household?.id) {
      return `${STORAGE_KEY}:${state.session.user.id}:${state.household.id}`;
    }
    return `${STORAGE_KEY}:device`;
  };

  const readSettings = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(scopedStorageKey()) || "null") || {};
      return { enabled: Boolean(saved.enabled) };
    } catch {
      return { enabled: false };
    }
  };

  let pushSettings = readSettings();
  let card = null;
  let serviceWorkerRegistration = null;
  let publicKeyCache = "";
  let busy = false;
  let reconcileGeneration = 0;
  let diagnosis = null;
  let diagnosticBusy = false;

  const notificationPermission = () => {
    try { return "Notification" in window ? Notification.permission : "unsupported"; }
    catch { return "unsupported"; }
  };

  const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  const getStatus = () => ({
    enabled: pushSettings.enabled,
    pushReady: pushSettings.enabled && notificationPermission() === "granted" && diagnosis?.server === true,
    permission: notificationPermission(),
    serviceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    supported: pushSupported(),
    configured: pushSettings.enabled || Boolean(publicKeyCache),
    mode: pushSettings.enabled ? "push-ready" : pushSupported() ? "not-configured" : "in-app",
  });

  const persist = () => {
    try { localStorage.setItem(scopedStorageKey(), JSON.stringify(pushSettings)); } catch { /* 현재 화면 상태는 유지 */ }
  };

  const ensurePwaMetadata = () => {
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = document.createElement("link");
      manifest.rel = "manifest";
      manifest.href = MANIFEST_URL;
      document.head.appendChild(manifest);
    }
    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      const capable = document.createElement("meta");
      capable.name = "apple-mobile-web-app-capable";
      capable.content = "yes";
      document.head.appendChild(capable);
    }
    if (!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')) {
      const statusBar = document.createElement("meta");
      statusBar.name = "apple-mobile-web-app-status-bar-style";
      statusBar.content = "default";
      document.head.appendChild(statusBar);
    }
  };

  const registerServiceWorker = async () => {
    if (!pushSupported()) throw new Error("PUSH_UNSUPPORTED");
    if (serviceWorkerRegistration) return serviceWorkerRegistration;
    serviceWorkerRegistration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "./", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    return serviceWorkerRegistration;
  };

  const functionErrorCode = async (error) => {
    const context = error?.context;
    if (context && typeof context.clone === "function" && typeof context.json === "function") {
      try {
        const payload = await context.clone().json();
        if (payload?.error) return String(payload.error);
      } catch { /* JSON 응답이 아니면 다음 후보 확인 */ }
    }
    const body = context?.body;
    if (body && typeof body === "object" && body.error) return String(body.error);
    if (typeof body === "string" && body.trim()) {
      try {
        const payload = JSON.parse(body);
        if (payload?.error) return String(payload.error);
      } catch { /* 일반 문자열 응답 사용 */ }
      return body.trim();
    }
    return String(error?.message || error || "FUNCTION_FAILED");
  };

  const invoke = async (body) => {
    if (typeof state === "undefined" || !state.supabase || !state.session || !state.household?.id) {
      throw new Error("LOGIN_REQUIRED");
    }
    const supabase = state.supabase;
    const userId = state.session.user.id;
    const householdId = state.household.id;
    const { data, error } = await window.FAMILY_AUTH_API.withRecovery(
      () => supabase.functions.invoke(FUNCTION_NAME, { body }),
      {
        supabase,
        userId,
        isCurrent: () => state.supabase === supabase
          && state.session?.user?.id === userId
          && state.household?.id === householdId,
      },
    );
    if (error) throw new Error(await functionErrorCode(error));
    if (data?.error) throw new Error(data.error);
    return data || {};
  };

  const base64UrlToUint8Array = (value) => {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  };

  const loadPublicKey = async () => {
    if (publicKeyCache) return publicKeyCache;
    const data = await invoke({ action: "public-key" });
    if (!data.publicKey) throw new Error("PUSH_NOT_CONFIGURED");
    publicKeyCache = data.publicKey;
    return publicKeyCache;
  };

  const currentSubscription = async () => {
    if (!pushSupported()) return null;
    const registration = await registerServiceWorker();
    return registration.pushManager.getSubscription();
  };

  const syncSubscription = async (subscription, { pushEnabled }) => invoke({
    action: "subscribe",
    householdId: state.household.id,
    subscription: subscription.toJSON(),
    pushEnabled,
    briefingEnabled: false,
    time: SUBSCRIPTION_TIME,
    timezone: resolvedTimezone(),
  });

  const loadSubscriptionStatus = async (client, householdId, subscription) => {
    const userId = state.session.user.id;
    const { data, error } = await window.FAMILY_AUTH_API.withRecovery(
      () => client.functions.invoke(FUNCTION_NAME, {
        body: {
          action: "subscription-status",
          householdId,
          endpoint: subscription.endpoint,
        },
      }),
      {
        supabase: client,
        userId,
        isCurrent: () => state.supabase === client
          && state.session?.user?.id === userId
          && state.household?.id === householdId,
      },
    );
    if (error) throw new Error(await functionErrorCode(error));
    if (data?.error) throw new Error(data.error);
    return data || {};
  };

  const reconcileSubscriptionState = async () => {
    const generation = ++reconcileGeneration;
    if (demoMode || typeof state === "undefined" || !state.supabase || !state.session || !state.household?.id || !pushSupported()) return;
    const client = state.supabase;
    const userId = state.session.user.id;
    const householdId = state.household.id;
    try {
      const subscription = await currentSubscription();
      const enabled = subscription
        ? Boolean((await loadSubscriptionStatus(client, householdId, subscription)).enabled)
        : false;
      if (generation !== reconcileGeneration
        || typeof state === "undefined"
        || state.supabase !== client
        || state.session?.user?.id !== userId
        || state.household?.id !== householdId) return;
      diagnosis = {device: Boolean(subscription), server: enabled};
      pushSettings.enabled = enabled;
      persist();
      updateControls();
    } catch (error) {
      console.warn("가족 기록 변경 알림 상태 확인 실패", error);
    }
  };

  const friendlyError = (error) => {
    const code = String(error?.message || error || "");
    if (code.includes("LOGIN_REQUIRED") || code.includes("UNAUTHORIZED")) return "로그인 후 가족 공간에서 사용할 수 있어요.";
    if (code.includes("PUSH_UNSUPPORTED")) return "이 브라우저는 앱 알림을 지원하지 않아요.";
    if (code.includes("PUSH_NOT_CONFIGURED") || code.includes("FunctionsHttpError") || code.includes("FUNCTION_FAILED")) {
      return "알림 서버의 VAPID 설정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.";
    }
    if (code.includes("RATE_LIMITED")) return "요청이 많아요. 잠시 후 다시 시도해 주세요.";
    if (code.includes("SUBSCRIPTION_NOT_FOUND")) return "기기 등록이 없어요. 알림 받기를 눌러 연결해 주세요.";
    if (code.includes("SUBSCRIBE_FAILED")) return "이 기기의 알림 설정을 저장하지 못했어요.";
    if (code.includes("INVALID_SUBSCRIPTION")) return "이 기기의 알림 정보가 올바르지 않아요. 앱을 완전히 닫았다가 다시 열어 주세요.";
    if (code.includes("NotAllowedError") || code.includes("PERMISSION_DENIED")) return "iPhone 설정에서 이 앱의 알림을 허용해 주세요.";
    if (code.includes("HOUSEHOLD_NOT_FOUND")) return "가족 공간을 확인하지 못했어요.";
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(code)) return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
    return "알림 서버 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.";
  };

  const setBusy = (next) => {
    busy = next;
    updateDiagnosticControls();
    const toggle = card?.querySelector("#eventChangePushToggle");
    if (toggle) {
      toggle.disabled = demoMode || next;
      toggle.setAttribute("aria-busy", String(next));
    }
  };

  function updateStatus(message = "", tone = "") {
    const status = card?.querySelector("#eventChangePushStatus");
    if (!status) return;
    status.className = `event-change-push-status${tone ? ` ${tone}` : ""}`;
    if (message) {
      status.textContent = message;
      return;
    }
    if (demoMode) {
      status.textContent = "테스트 모드에서는 실제 기기 알림을 설정하지 않아요.";
      status.classList.add("guide");
    } else if (!pushSupported()) {
      status.textContent = "현재 브라우저에서는 앱 알림을 지원하지 않아요.";
      status.classList.add("error");
    } else if (isIos() && !isStandalone()) {
      status.textContent = "Safari 공유 버튼으로 홈 화면에 추가한 뒤 앱 아이콘으로 열어 주세요.";
      status.classList.add("guide");
    } else if (notificationPermission() === "denied") {
      status.textContent = "iPhone 설정 → 알림에서 이 앱의 알림을 허용해 주세요.";
      status.classList.add("error");
    } else if (pushSettings.enabled) {
      status.textContent = "이 기기의 가족 기록 변경 알림이 켜져 있어요.";
      status.classList.add("active");
    } else {
      status.textContent = "이 기기에서는 아직 알림을 받지 않아요.";
    }
  }

  function updateControls() {
    if (!card) return;
    const toggle = card.querySelector("#eventChangePushToggle");
    if (toggle) {
      toggle.textContent = demoMode ? "실제 앱에서 설정" : pushSettings.enabled ? "알림 끄기" : "알림 받기";
      toggle.classList.toggle("active", pushSettings.enabled);
      toggle.setAttribute("aria-pressed", String(pushSettings.enabled));
      toggle.disabled = demoMode || busy || diagnosticBusy;
    }
    updateStatus();
    updateDiagnosticControls();
    renderDiagnosis();
  }

  const diagnosticScope = () => typeof state === "undefined" ? "" : `${state.session?.user?.id}|${state.household?.id}`;
  const renderDiagnosis = () => {
    const output = card?.querySelector("#pushDiagnosis");
    if (!output) return;
    const permission = ({granted: "허용", denied: "차단", default: "미설정", unsupported: "지원 안 됨"})[notificationPermission()];
    output.textContent = `알림 권한: ${permission}\n실행 환경: ${isStandalone() ? "홈 화면 앱" : "브라우저"}\n기기 등록: ${diagnosis?.device == null ? "확인 필요" : diagnosis.device ? "등록됨" : "없음"}\n서버 연결: ${diagnosis?.server == null ? "확인 필요" : diagnosis.server ? "알림 켜짐" : "알림 꺼짐 또는 미등록"}`;
  };
  const diagnosePush = async () => {
    if (diagnosticBusy || busy) return false;
    const scope = diagnosticScope();
    const client = typeof state === "undefined" ? null : state.supabase;
    const current = () => scope === diagnosticScope() && typeof state !== "undefined" && client === state.supabase;
    diagnosticBusy = true;
    reconcileGeneration += 1;
    diagnosis = null;
    updateControls(); renderDiagnosis();
    try {
      if (demoMode) throw new Error("DEMO_MODE");
      if (!pushSupported()) throw new Error("PUSH_UNSUPPORTED");
      if (!client || !state.session || !state.household?.id) throw new Error("LOGIN_REQUIRED");
      const householdId = state.household.id;
      const subscription = await currentSubscription();
      if (!current()) return false;
      diagnosis = {device: Boolean(subscription), server: null};
      renderDiagnosis();
      const result = subscription ? await loadSubscriptionStatus(client, householdId, subscription) : {enabled:false};
      if (!current()) return false;
      diagnosis.server = Boolean(result.enabled);
      pushSettings.enabled = diagnosis.server;
      persist(); updateControls(); renderDiagnosis();
      updateStatus(notificationPermission() !== "granted" ? "기기 설정에서 알림을 허용해 주세요." : diagnosis.server ? "등록 상태는 정상이에요. 테스트 알림으로 실제 수신을 확인해 주세요." : "알림 받기를 눌러 이 기기를 연결해 주세요.", "guide");
      return Boolean(subscription && diagnosis.server && notificationPermission() === "granted");
    } catch (error) {
      if (current()) { renderDiagnosis(); updateStatus(demoMode ? "테스트 모드에서는 실제 기기를 진단하지 않아요." : friendlyError(error), "error"); }
      return false;
    } finally { diagnosticBusy = false; updateDiagnosticControls(); }
  };
  const updateDiagnosticControls = () => {
    for (const id of ["pushDiagnoseButton", "pushTestButton", "eventChangePushToggle"]) {
      const button = card?.querySelector(`#${id}`);
      if (button) button.disabled = demoMode || busy || diagnosticBusy;
    }
  };
  const sendTestPush = async () => {
    if (busy || diagnosticBusy || demoMode) return;
    const startingScope = diagnosticScope();
    const ready = await diagnosePush();
    if (!ready || startingScope !== diagnosticScope()) return;
    const scope = diagnosticScope(), client = state.supabase, householdId = state.household.id;
    const current = () => scope === diagnosticScope() && typeof state !== "undefined" && client === state.supabase;
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      if (!current()) return;
      if (!subscription?.endpoint) throw new Error("SUBSCRIPTION_NOT_FOUND");
      const result = await invoke({action:"test", householdId, endpoint:subscription.endpoint});
      if (!current()) return;
      updateStatus(result.sent > 0 ? "푸시 서버가 테스트 알림을 접수했어요. 알림 센터를 확인해 주세요. 안 보이면 집중 모드·알림 요약·잠금 화면 표시 설정을 확인해 주세요." : "발송된 알림이 없어요. 알림 받기로 기기 연결을 다시 확인해 주세요.", result.sent > 0 ? "guide" : "error");
    } catch (error) { if (current()) updateStatus(friendlyError(error), "error"); }
    finally { setBusy(false); }
  };

  const enablePush = async () => {
    if (busy) return false;
    if (demoMode) {
      updateStatus("테스트 모드에서는 실제 알림 권한을 요청하지 않아요.", "guide");
      return false;
    }
    if (!pushSupported()) {
      updateStatus("이 브라우저는 시스템 알림을 지원하지 않아요.", "error");
      return false;
    }
    if (isIos() && !isStandalone()) {
      updateStatus("iPhone에서는 홈 화면에 추가한 앱으로 열어야 알림을 받을 수 있어요.", "guide");
      return false;
    }
    if (typeof state === "undefined" || !state.supabase || !state.session || !state.household?.id) {
      updateStatus("로그인 후 가족 공간에서 알림을 켜 주세요.", "error");
      return false;
    }

    setBusy(true);
    updateStatus("이 기기를 가족 기록 알림에 연결하고 있어요…");
    try {
      const permission = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== "granted") throw new Error("PERMISSION_DENIED");

      const registration = await registerServiceWorker();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const publicKey = await loadPublicKey();
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(publicKey),
        });
      }

      await syncSubscription(subscription, { pushEnabled: true });
      diagnosis = {device: true, server: true};
      pushSettings.enabled = true;
      persist();
      updateControls();
      if (typeof toast === "function") toast("가족 기록 변경 알림을 켰어요 🔔");
      return true;
    } catch (error) {
      pushSettings.enabled = false;
      persist();
      updateControls();
      updateStatus(friendlyError(error), "error");
      console.error("가족 기록 변경 알림 설정 실패", error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    if (busy) return false;
    setBusy(true);
    updateStatus("이 기기의 가족 기록 알림을 끄고 있어요…");
    try {
      const subscription = await currentSubscription();
      if (subscription && state?.session && state?.household?.id) {
        await syncSubscription(subscription, { pushEnabled: false });
      }
      pushSettings.enabled = false;
      persist();
      updateControls();
      if (typeof toast === "function") toast("이 기기의 가족 기록 변경 알림을 껐어요");
      return true;
    } catch (error) {
      updateStatus(friendlyError(error), "error");
      console.warn("가족 기록 변경 알림 해제 실패", error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const installSettingsCard = () => {
    const settingsView = document.querySelector("#settingsView");
    if (!settingsView) return false;
    const existing = settingsView.querySelector("#eventChangePushSettings");
    if (existing) {
      card = existing;
      updateControls();
      return true;
    }

    card = document.createElement("section");
    card.id = "eventChangePushSettings";
    card.className = "settings-card event-change-push-settings";
    card.innerHTML = `
      <div class="event-change-push-heading">
        <span class="settings-mark" aria-hidden="true">🔔</span>
        <div>
          <p class="eyebrow">가족 알림</p>
          <h2>가족 기록 변경 알림</h2>
          <span>다른 가족이 일정·성장·수유·기저귀 기록을 추가·수정·삭제하면 이 기기로 알려드려요.</span>
        </div>
      </div>
      <button id="eventChangePushToggle" type="button" aria-pressed="false">알림 받기</button>
      <p id="eventChangePushStatus" class="event-change-push-status" role="status" aria-live="polite"></p>
      <div class="push-diagnostic-actions"><button id="pushDiagnoseButton" type="button">알림 상태 확인</button><button id="pushTestButton" type="button">테스트 알림 보내기</button></div>
      <p id="pushDiagnosis" class="push-diagnosis" role="status" aria-live="polite"></p>
      <p class="event-change-push-ios-note"><span>본인이 작성한 기록은 본인에게 푸시를 보내지 않아요. 테스트 알림은 현재 기기로만 보내요.</span></p>
      <p class="event-change-push-ios-note"><strong>iPhone 안내</strong><span>Safari 공유 버튼 → 홈 화면에 추가 → 앱 아이콘으로 열어야 잠금 화면 알림을 받을 수 있어요.</span></p>`;
    settingsView.appendChild(card);

    card.querySelector("#eventChangePushToggle").addEventListener("click", () => {
      if (pushSettings.enabled) disablePush();
      else enablePush();
    });
    card.querySelector("#pushDiagnoseButton").addEventListener("click", diagnosePush);
    card.querySelector("#pushTestButton").addEventListener("click", sendTestPush);
    updateControls();
    return true;
  };

  const install = (attempt = 0) => {
    ensurePwaMetadata();
    if (!demoMode) registerServiceWorker().catch(() => { /* 사용자가 켤 때 구체적인 상태를 안내 */ });
    if (!installSettingsCard()) {
      if (attempt < 40) setTimeout(() => install(attempt + 1), 100);
      return;
    }
    reconcileSubscriptionState();
  };

  const reloadForContext = () => {
    diagnosis = null;
    pushSettings = readSettings();
    publicKeyCache = "";
    updateControls();
    reconcileSubscriptionState();
  };

  window.addEventListener("familycontextchange", reloadForContext);
  window.FAMILY_EVENT_CHANGE_PUSH_API = { getStatus, diagnose: diagnosePush };
  install();
})();
