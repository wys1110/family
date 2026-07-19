(() => {
  const STORAGE_KEY = "family-feeding-reminder-v1";
  const CLAIM_SUFFIX = ":alert-claim";
  const TAB_ID = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const DEFAULTS = {
    enabled: false,
    target: "breast",
    intervalMinutes: 180,
    enabledAt: 0,
    lastAlertReference: "",
    dismissedBannerReference: "",
  };

  const scopedStorageKey = () => {
    if (typeof state !== "undefined" && state.session?.user?.id && state.household?.id) {
      return `${STORAGE_KEY}:${state.session.user.id}:${state.household.id}:${state.activeBabyId || "no-baby"}`;
    }
    return `${STORAGE_KEY}:device:${typeof state !== "undefined" ? state.activeBabyId || "no-baby" : "no-baby"}`;
  };

  const sanitizeSettings = (saved = {}) => ({
    ...DEFAULTS,
    ...saved,
    enabled: Boolean(saved.enabled),
    target: ["breast", "formula", "all"].includes(saved.target) ? saved.target : DEFAULTS.target,
    intervalMinutes: Math.max(15, Math.min(24 * 60, Number(saved.intervalMinutes) || DEFAULTS.intervalMinutes)),
    enabledAt: Number(saved.enabledAt) || 0,
    lastAlertReference: String(saved.lastAlertReference || ""),
    dismissedBannerReference: String(saved.dismissedBannerReference || ""),
  });

  const readSettings = () => {
    try {
      return sanitizeSettings(JSON.parse(localStorage.getItem(scopedStorageKey()) || "null") || {});
    } catch {
      return { ...DEFAULTS };
    }
  };

  let reminder = readSettings();
  let checking = false;
  let activeReferenceKey = "";
  let cardStatusUpdater = null;

  const persist = () => {
    try { localStorage.setItem(scopedStorageKey(), JSON.stringify(reminder)); } catch { /* 현재 기기에서만 동작 */ }
  };

  const feedingTypeOf = (entry) => {
    if (entry.category !== "수유·이유식") return "";
    const feedingType = String(entry.feedingType || "").trim();
    const title = String(entry.title || "");
    if (feedingType === "모유" || title.includes("모유")) return "breast";
    return "formula";
  };

  const matchesTarget = (entry) => {
    const type = feedingTypeOf(entry);
    return type && (reminder.target === "all" || type === reminder.target);
  };

  const timestampOf = (entry) => {
    if (!entry?.date || !entry?.time) return 0;
    const timestamp = new Date(`${entry.date}T${entry.time}:00`).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const latestMatchingEntry = () => {
    if (typeof state === "undefined") return null;
    const activeId = state.activeBabyId;
    const now = Date.now();
    return state.growthEntries
      .filter((entry) => (!activeId || !entry.babyId || entry.babyId === activeId) && matchesTarget(entry))
      .map((entry) => ({ entry, timestamp: timestampOf(entry) }))
      .filter((item) => item.timestamp > 0 && item.timestamp <= now)
      .sort((a, b) => b.timestamp - a.timestamp)[0] || null;
  };

  const targetLabel = () => ({ breast: "모유", formula: "분유", all: "수유" })[reminder.target];

  const durationText = (minutes) => {
    const safe = Math.max(0, Math.round(minutes));
    const hours = Math.floor(safe / 60);
    const rest = safe % 60;
    if (hours && rest) return `${hours}시간 ${rest}분`;
    if (hours) return `${hours}시간`;
    return `${rest}분`;
  };

  const ensureAlertBanner = () => {
    let banner = document.querySelector("#feedingReminderAlert");
    if (banner) return banner;
    const growthView = document.querySelector("#growthView");
    if (!growthView) return null;
    banner = document.createElement("aside");
    banner.id = "feedingReminderAlert";
    banner.className = "feeding-reminder-alert";
    banner.hidden = true;
    banner.innerHTML = `
      <div class="feeding-reminder-alert-icon" aria-hidden="true">⏰</div>
      <div class="feeding-reminder-alert-copy"><strong></strong><span></span></div>
      <button type="button" data-feeding-reminder-record>기록</button>
      <button type="button" class="feeding-reminder-alert-close" data-feeding-reminder-close aria-label="알림 닫기">×</button>`;
    growthView.prepend(banner);
    banner.addEventListener("click", (event) => {
      if (event.target.closest("[data-feeding-reminder-record]")) {
        if (typeof switchView === "function") switchView("growth");
        if (typeof openGrowthDialog === "function") openGrowthDialog(null, "수유·이유식");
      }
      if (event.target.closest("[data-feeding-reminder-close]")) {
        banner.hidden = true;
        if (!activeReferenceKey) return;
        reminder = readSettings();
        reminder.dismissedBannerReference = activeReferenceKey;
        persist();
      }
    });
    return banner;
  };

  const showDueBanner = (elapsedMinutes, referenceKey) => {
    activeReferenceKey = referenceKey;
    const banner = ensureAlertBanner();
    if (!banner) return;
    if (reminder.dismissedBannerReference === referenceKey) {
      banner.hidden = true;
      return;
    }
    const label = targetLabel();
    banner.querySelector("strong").textContent = `${label} 시간이 지났어요`;
    banner.querySelector("span").textContent = `마지막 ${label} 기록 후 ${durationText(elapsedMinutes)}이 지났어요.`;
    banner.hidden = false;
  };

  const hideAlert = () => {
    activeReferenceKey = "";
    const banner = document.querySelector("#feedingReminderAlert");
    if (banner) banner.hidden = true;
  };

  const notifyOnce = (elapsedMinutes, referenceKey) => {
    const label = targetLabel();
    const text = `마지막 ${label} 기록 후 ${durationText(elapsedMinutes)}이 지났어요.`;
    const pageVisible = document.visibilityState === "visible";
    if (pageVisible && typeof toast === "function") {
      toast(text);
      return;
    }
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(`가족 돌봄 · ${label} 알림`, {
          body: text,
          tag: `family-feeding-${referenceKey}`,
          renotify: false,
        });
      } catch { /* 브라우저가 시스템 알림을 막아도 화면 배너는 유지 */ }
    }
  };

  const markAlertReference = (referenceKey) => {
    const latest = readSettings();
    reminder = latest;
    if (!latest.enabled || latest.lastAlertReference === referenceKey) return false;
    reminder.lastAlertReference = referenceKey;
    persist();
    return true;
  };

  const fallbackAlertClaim = async (referenceKey) => {
    const claimKey = `${scopedStorageKey()}${CLAIM_SUFFIX}`;
    const now = Date.now();
    try {
      const currentClaim = JSON.parse(localStorage.getItem(claimKey) || "null");
      if (currentClaim?.referenceKey === referenceKey && Number(currentClaim.expiresAt) > now) return false;
    } catch { /* 새 claim으로 복구 */ }

    await new Promise((resolve) => setTimeout(resolve, 25 + Math.floor(Math.random() * 75)));
    if (readSettings().lastAlertReference === referenceKey) return false;

    const token = `${TAB_ID}:${Date.now()}:${Math.random()}`;
    try {
      localStorage.setItem(claimKey, JSON.stringify({
        referenceKey,
        token,
        expiresAt: Date.now() + 5000,
      }));
      await new Promise((resolve) => setTimeout(resolve, 90));
      const winner = JSON.parse(localStorage.getItem(claimKey) || "null");
      if (winner?.token !== token) return false;
    } catch {
      return markAlertReference(referenceKey);
    }
    return markAlertReference(referenceKey);
  };

  const claimAlert = async (referenceKey) => {
    const lockManager = navigator.locks;
    if (lockManager?.request) {
      const lockName = `family-feeding-alert:${scopedStorageKey()}`;
      return lockManager.request(lockName, { mode: "exclusive", ifAvailable: true }, (lock) => {
        if (!lock) return false;
        return markAlertReference(referenceKey);
      });
    }
    return fallbackAlertClaim(referenceKey);
  };

  const checkReminder = async () => {
    if (checking) return;
    checking = true;
    try {
      reminder = readSettings();
      cardStatusUpdater?.();
      if (!reminder.enabled || typeof state === "undefined") {
        hideAlert();
        return;
      }

      const latest = latestMatchingEntry();
      const baseTimestamp = Math.max(latest?.timestamp || 0, reminder.enabledAt || 0) || Date.now();
      const elapsedMinutes = (Date.now() - baseTimestamp) / 60000;
      const referenceKey = `${state.activeBabyId || "baby"}:${reminder.target}:${baseTimestamp}`;

      if (elapsedMinutes < reminder.intervalMinutes) {
        hideAlert();
        return;
      }

      showDueBanner(elapsedMinutes, referenceKey);
      if (reminder.lastAlertReference === referenceKey) return;
      if (await claimAlert(referenceKey)) notifyOnce(elapsedMinutes, referenceKey);
    } finally {
      checking = false;
    }
  };

  const installSettingsCard = () => {
    const settingsView = document.querySelector("#settingsView");
    if (!settingsView || settingsView.querySelector("#feedingReminderSettings")) return false;

    const hours = Math.floor(reminder.intervalMinutes / 60);
    const minutes = reminder.intervalMinutes % 60;
    const card = document.createElement("section");
    card.id = "feedingReminderSettings";
    card.className = "settings-card feeding-reminder-settings";
    card.innerHTML = `
      <div class="settings-heading">
        <span class="settings-mark" aria-hidden="true">⏰</span>
        <div>
          <p class="eyebrow">REMINDER</p>
          <h2>수유 알림</h2>
          <span>정한 시간 동안 기록이 없으면 이 기기에서 한 번 알려줘요.</span>
        </div>
        <label class="feeding-reminder-switch">
          <input id="feedingReminderEnabled" type="checkbox" ${reminder.enabled ? "checked" : ""}>
          <span aria-hidden="true"></span>
        </label>
      </div>
      <div class="feeding-reminder-form">
        <label><span>알림 대상</span><select id="feedingReminderTarget">
          <option value="breast" ${reminder.target === "breast" ? "selected" : ""}>모유</option>
          <option value="formula" ${reminder.target === "formula" ? "selected" : ""}>분유</option>
          <option value="all" ${reminder.target === "all" ? "selected" : ""}>전체 수유</option>
        </select></label>
        <fieldset>
          <legend>알림 주기</legend>
          <label><input id="feedingReminderHours" type="number" min="0" max="24" inputmode="numeric" value="${hours}"><span>시간</span></label>
          <label><input id="feedingReminderMinutes" type="number" min="0" max="59" inputmode="numeric" value="${minutes}"><span>분</span></label>
        </fieldset>
        <div class="feeding-reminder-presets" aria-label="빠른 주기 선택">
          <button type="button" data-reminder-minutes="120">2시간</button>
          <button type="button" data-reminder-minutes="180">3시간</button>
          <button type="button" data-reminder-minutes="240">4시간</button>
        </div>
        <button id="feedingReminderPermission" class="feeding-reminder-permission" type="button">브라우저 알림 허용</button>
        <p id="feedingReminderStatus" class="feeding-reminder-status" aria-live="polite"></p>
      </div>`;
    settingsView.appendChild(card);

    const enabled = card.querySelector("#feedingReminderEnabled");
    const target = card.querySelector("#feedingReminderTarget");
    const hoursInput = card.querySelector("#feedingReminderHours");
    const minutesInput = card.querySelector("#feedingReminderMinutes");
    const permissionButton = card.querySelector("#feedingReminderPermission");
    const status = card.querySelector("#feedingReminderStatus");

    const updateStatus = () => {
      enabled.checked = reminder.enabled;
      target.value = reminder.target;
      hoursInput.value = String(Math.floor(reminder.intervalMinutes / 60));
      minutesInput.value = String(reminder.intervalMinutes % 60);
      status.textContent = reminder.enabled
        ? `${targetLabel()} 기록이 ${durationText(reminder.intervalMinutes)} 없으면 주기당 한 번 알림`
        : "현재 알림이 꺼져 있어요.";
      if (!("Notification" in window)) {
        permissionButton.textContent = "이 브라우저는 시스템 알림 미지원";
        permissionButton.disabled = true;
      } else if (Notification.permission === "granted") {
        permissionButton.textContent = "브라우저 알림 허용됨 ✓";
        permissionButton.disabled = true;
      } else if (Notification.permission === "denied") {
        permissionButton.textContent = "브라우저 설정에서 알림 허용 필요";
        permissionButton.disabled = false;
      } else {
        permissionButton.textContent = "브라우저 알림 허용";
        permissionButton.disabled = false;
      }
    };
    cardStatusUpdater = updateStatus;

    const saveInterval = () => {
      const next = Math.max(15, Math.min(24 * 60, (Number(hoursInput.value) || 0) * 60 + (Number(minutesInput.value) || 0)));
      reminder = readSettings();
      reminder.intervalMinutes = next;
      persist();
      updateStatus();
      checkReminder();
    };

    enabled.addEventListener("change", () => {
      reminder = readSettings();
      reminder.enabled = enabled.checked;
      reminder.enabledAt = reminder.enabled ? Date.now() : 0;
      reminder.lastAlertReference = "";
      reminder.dismissedBannerReference = "";
      persist();
      updateStatus();
      checkReminder();
      if (typeof toast === "function") toast(reminder.enabled ? "수유 알림을 켰어요 ⏰" : "수유 알림을 껐어요");
    });

    target.addEventListener("change", () => {
      reminder = readSettings();
      reminder.target = target.value;
      reminder.dismissedBannerReference = "";
      persist();
      updateStatus();
      checkReminder();
    });

    hoursInput.addEventListener("change", saveInterval);
    minutesInput.addEventListener("change", saveInterval);
    card.querySelector(".feeding-reminder-presets").addEventListener("click", (event) => {
      const button = event.target.closest("[data-reminder-minutes]");
      if (!button) return;
      reminder = readSettings();
      reminder.intervalMinutes = Number(button.dataset.reminderMinutes);
      persist();
      updateStatus();
      checkReminder();
    });

    permissionButton.addEventListener("click", async () => {
      if (!("Notification" in window)) return;
      try { await Notification.requestPermission(); } catch { /* 상태 문구로 안내 */ }
      updateStatus();
    });

    updateStatus();
    return true;
  };

  const install = (attempt = 0) => {
    const settingsReady = installSettingsCard();
    ensureAlertBanner();
    if (!settingsReady && attempt < 40) setTimeout(() => install(attempt + 1), 100);
  };

  const reloadForContext = () => {
    reminder = readSettings();
    cardStatusUpdater = null;
    document.querySelector("#feedingReminderSettings")?.remove();
    hideAlert();
    installSettingsCard();
    checkReminder();
  };

  if (typeof renderGrowth === "function" && !renderGrowth.__feedingReminderWrapped) {
    const originalRenderGrowth = renderGrowth;
    const enhancedRenderGrowth = function (...args) {
      const result = originalRenderGrowth.apply(this, args);
      setTimeout(checkReminder, 0);
      return result;
    };
    enhancedRenderGrowth.__feedingReminderWrapped = true;
    renderGrowth = enhancedRenderGrowth;
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== scopedStorageKey()) return;
    reminder = readSettings();
    cardStatusUpdater?.();
    checkReminder();
  });
  window.addEventListener("focus", checkReminder);
  window.addEventListener("familycontextchange", reloadForContext);
  window.addEventListener("familybabychange", reloadForContext);
  window.addEventListener("family:growth-entry-saved", checkReminder);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkReminder(); });
  setInterval(checkReminder, 60 * 1000);
  install();
  setTimeout(checkReminder, 500);
})();