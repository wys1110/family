(() => {
  const STORAGE_KEY = "family-daily-briefing-v1";
  const FUNCTION_NAME = "daily-briefing-push";
  const SERVICE_WORKER_URL = "service-worker.js";
  const MANIFEST_URL = "manifest.webmanifest";
  const DEFAULT_TIME = "09:00";
  const DEFAULT_TIMEZONE = "Asia/Seoul";
  const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

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
      return {
        enabled: Boolean(saved.enabled),
        time: TIME_PATTERN.test(saved.time || "") ? saved.time : DEFAULT_TIME,
        timezone: String(saved.timezone || resolvedTimezone()),
        pushReady: Boolean(saved.pushReady),
      };
    } catch {
      return { enabled: false, time: DEFAULT_TIME, timezone: resolvedTimezone(), pushReady: false };
    }
  };

  let briefing = readSettings();
  let card = null;
  let serviceWorkerRegistration = null;
  let publicKeyCache = "";
  let busy = false;

  const persist = () => {
    try { localStorage.setItem(scopedStorageKey(), JSON.stringify(briefing)); } catch { /* 현재 화면 설정은 유지 */ }
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

  const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

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
    if (typeof state === "undefined" || !state.supabase || !state.session || !state.household) {
      throw new Error("LOGIN_REQUIRED");
    }
    const { data, error } = await state.supabase.functions.invoke(FUNCTION_NAME, { body });
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

  const syncSubscription = async (subscription, { briefingEnabled = briefing.enabled } = {}) => {
    const payload = {
      action: "subscribe",
      householdId: state.household.id,
      subscription: subscription.toJSON(),
      pushEnabled: true,
      briefingEnabled,
      time: briefing.time,
      timezone: briefing.timezone,
    };
    await invoke(payload);
  };

  const sendTest = async (subscription) => {
    const result = await invoke({
      action: "test",
      householdId: state.household.id,
      endpoint: subscription.endpoint,
    });
    if (!Number(result.sent)) throw new Error("TEST_SEND_FAILED");
  };

  const friendlyError = (error) => {
    const code = String(error?.message || error || "");
    if (code.includes("LOGIN_REQUIRED") || code.includes("UNAUTHORIZED")) return "로그인 후 가족 공간에서 사용할 수 있어요.";
    if (code.includes("PUSH_UNSUPPORTED")) return "이 브라우저는 앱 알림을 지원하지 않아요.";
    if (code.includes("PUSH_NOT_CONFIGURED") || code.includes("FunctionsHttpError") || code.includes("FUNCTION_FAILED")) {
      return "알림 서버 준비가 끝나지 않았어요. 관리자 설정 후 다시 시도해 주세요.";
    }
    if (code.includes("SUBSCRIBE_FAILED")) return "알림 구독을 서버에 저장하지 못했어요. 데이터베이스 설정을 확인해 주세요.";
    if (code.includes("SUBSCRIPTION_LOAD_FAILED")) return "저장된 알림 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
    if (code.includes("SUBSCRIPTION_NOT_FOUND")) return "이 기기의 알림 연결을 찾지 못했어요. 앱 알림 켜기를 다시 눌러 주세요.";
    if (code.includes("INVALID_SUBSCRIPTION")) return "이 기기의 알림 정보가 올바르지 않아요. 앱을 완전히 닫았다가 다시 열어 주세요.";
    if (code.includes("TEST_SEND_FAILED")) return "알림 연결은 완료됐지만 테스트 발송에 실패했어요. 잠시 후 다시 눌러 주세요.";
    if (code.includes("NotAllowedError") || code.includes("PERMISSION_DENIED")) return "iPhone 설정에서 이 앱의 알림을 허용해 주세요.";
    if (code.includes("HOUSEHOLD_NOT_FOUND")) return "가족 공간을 확인하지 못했어요.";
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(code)) return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
    return "알림 서버 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.";
  };

  const setBusy = (next) => {
    busy = next;
    card?.querySelectorAll("button, input").forEach((element) => {
      if (element.id === "dailyBriefingTime") return;
      element.disabled = next;
    });
  };

  const enablePush = async ({ test = false } = {}) => {
    if (busy) return false;
    if (!pushSupported()) {
      updateStatus("이 브라우저는 시스템 알림을 지원하지 않아요.", "error");
      return false;
    }
    if (isIos() && !isStandalone()) {
      updateStatus("iPhone에서는 공유 버튼 → 홈 화면에 추가 후 앱 아이콘으로 열어야 알림을 받을 수 있어요.", "guide");
      return false;
    }
    if (typeof state === "undefined" || !state.session || !state.household) {
      updateStatus("로그인 후 가족 공간에서 알림을 켜 주세요.", "error");
      return false;
    }

    setBusy(true);
    updateStatus(test ? "테스트 알림을 준비하고 있어요…" : "알림 서버에 연결하고 있어요…");
    try {
      const permissionPromise = Notification.permission === "default"
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission);
      const permission = await permissionPromise;
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

      briefing.timezone = resolvedTimezone();
      await syncSubscription(subscription, { briefingEnabled: true });
      briefing.enabled = true;
      briefing.pushReady = true;
      persist();
      updateControls();

      if (test) {
        try {
          await sendTest(subscription);
          if (typeof toast === "function") toast("테스트 일정 브리핑을 보냈어요 🔔");
        } catch (error) {
          updateStatus(friendlyError(error), "error");
          console.error("일정 브리핑 테스트 발송 실패", error);
          return true;
        }
      } else if (typeof toast === "function") {
        toast(`매일 ${briefing.time} 일정 브리핑을 켰어요 🔔`);
      }
      return true;
    } catch (error) {
      briefing.enabled = false;
      briefing.pushReady = false;
      persist();
      updateControls();
      updateStatus(friendlyError(error), "error");
      console.error("일정 브리핑 알림 설정 실패", error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    if (busy) return;
    setBusy(true);
    briefing.enabled = false;
    persist();
    try {
      const subscription = await currentSubscription();
      if (subscription && state?.session && state?.household) {
        await syncSubscription(subscription, { briefingEnabled: false });
      }
      if (typeof toast === "function") toast("아침 브리핑은 끄고, 가족 일정 변경 알림은 계속 받아요");
    } catch (error) {
      console.warn("일정 브리핑 비활성화 동기화 실패", error);
    } finally {
      updateControls();
      setBusy(false);
    }
  };

  function updateStatus(message = "", tone = "") {
    const status = card?.querySelector("#dailyBriefingStatus");
    if (!status) return;
    status.className = `daily-briefing-status${tone ? ` ${tone}` : ""}`;
    if (message) {
      status.textContent = message;
      return;
    }

    if (!pushSupported()) {
      status.textContent = "현재 브라우저에서는 앱 알림을 지원하지 않아요.";
      status.classList.add("error");
    } else if (isIos() && !isStandalone()) {
      status.textContent = "홈 화면에 추가한 뒤 앱 아이콘으로 열면 알림을 켤 수 있어요.";
      status.classList.add("guide");
    } else if (Notification.permission === "denied") {
      status.textContent = "iPhone 설정 → 알림에서 이 앱을 허용해 주세요.";
      status.classList.add("error");
    } else if (briefing.enabled && briefing.pushReady) {
      status.textContent = `매일 ${briefing.time} · 오늘 일정 요약을 이 기기로 보내요.`;
      status.classList.add("active");
    } else if (briefing.pushReady) {
      status.textContent = "가족 일정 변경 알림은 연결됐어요. 아침 브리핑은 꺼져 있어요.";
      status.classList.add("active");
    } else if (briefing.enabled) {
      status.textContent = "알림 서버 연결을 확인하고 있어요.";
    } else {
      status.textContent = `기본 시간은 매일 ${briefing.time}이에요. 알림 켜기를 한 번 눌러 주세요.`;
    }
  }

  function updateControls() {
    if (!card) return;
    const enabled = card.querySelector("#dailyBriefingEnabled");
    const time = card.querySelector("#dailyBriefingTime");
    const permission = card.querySelector("#dailyBriefingPermission");
    if (enabled) enabled.checked = briefing.enabled;
    if (time) time.value = briefing.time;
    if (permission) permission.textContent = briefing.pushReady ? "알림 연결됨 ✓" : "앱 알림 켜기";
    updateStatus();
  }

  const installSettingsCard = () => {
    const settingsView = document.querySelector("#settingsView");
    if (!settingsView) return false;
    if (settingsView.querySelector("#dailyBriefingSettings")) {
      card = settingsView.querySelector("#dailyBriefingSettings");
      updateControls();
      return true;
    }

    card = document.createElement("section");
    card.id = "dailyBriefingSettings";
    card.className = "settings-card daily-briefing-settings";
    card.innerHTML = `
      <div class="settings-heading">
        <span class="settings-mark" aria-hidden="true">🔔</span>
        <div>
          <p class="eyebrow">DAILY BRIEFING</p>
          <h2>아침 일정 브리핑</h2>
          <span>오늘 일정의 시간과 제목을 매일 아침 앱 알림으로 알려줘요.</span>
        </div>
        <label class="daily-briefing-switch" aria-label="아침 일정 브리핑 켜기">
          <input id="dailyBriefingEnabled" type="checkbox">
          <span aria-hidden="true"></span>
        </label>
      </div>
      <div class="daily-briefing-form">
        <label class="daily-briefing-time-field">
          <span>알림 시간</span>
          <input id="dailyBriefingTime" type="time" value="${briefing.time}" step="300">
        </label>
        <div class="daily-briefing-actions">
          <button id="dailyBriefingPermission" type="button">앱 알림 켜기</button>
          <button id="dailyBriefingTest" type="button">테스트 알림</button>
        </div>
        <p id="dailyBriefingStatus" class="daily-briefing-status" aria-live="polite"></p>
        <p class="daily-briefing-install-note"><strong>iPhone 안내</strong><span>Safari 공유 버튼 → 홈 화면에 추가 → 생성된 앱 아이콘으로 실행해야 잠금 화면 알림이 와요.</span></p>
      </div>`;
    settingsView.appendChild(card);

    card.querySelector("#dailyBriefingEnabled").addEventListener("change", async (event) => {
      if (event.target.checked) {
        const enabled = await enablePush();
        if (!enabled) event.target.checked = false;
      } else {
        await disablePush();
      }
    });

    card.querySelector("#dailyBriefingPermission").addEventListener("click", () => enablePush());
    card.querySelector("#dailyBriefingTest").addEventListener("click", () => enablePush({ test: true }));
    card.querySelector("#dailyBriefingTime").addEventListener("change", async (event) => {
      const nextTime = TIME_PATTERN.test(event.target.value) ? event.target.value : DEFAULT_TIME;
      briefing.time = nextTime;
      event.target.value = nextTime;
      persist();
      updateControls();
      if (!briefing.enabled || !briefing.pushReady) return;
      try {
        const subscription = await currentSubscription();
        if (subscription) await syncSubscription(subscription, { briefingEnabled: true });
        if (typeof toast === "function") toast(`일정 브리핑을 ${nextTime}로 바꿨어요`);
      } catch (error) {
        briefing.pushReady = false;
        persist();
        updateStatus(friendlyError(error), "error");
      }
    });

    updateControls();
    return true;
  };

  const install = (attempt = 0) => {
    ensurePwaMetadata();
    registerServiceWorker().catch(() => { /* 권한을 켤 때 상태로 안내 */ });
    if (!installSettingsCard() && attempt < 40) setTimeout(() => install(attempt + 1), 100);
  };

  const reloadForContext = () => {
    briefing = readSettings();
    publicKeyCache = "";
    updateControls();
  };

  window.addEventListener("familycontextchange", reloadForContext);
  install();
})();
