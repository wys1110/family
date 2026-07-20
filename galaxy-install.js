(() => {
  const SERVICE_WORKER_URL = "service-worker.js";
  const MANIFEST_URL = "manifest.webmanifest";
  const CARD_ID = "galaxyInstallCard";
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isSamsungInternet = /SamsungBrowser/i.test(navigator.userAgent);
  const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

  let deferredInstallPrompt = null;
  let card = null;
  let registration = null;

  const ensureMetadata = () => {
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = document.createElement("link");
      manifest.rel = "manifest";
      manifest.href = MANIFEST_URL;
      document.head.appendChild(manifest);
    }

    const metas = [
      ["mobile-web-app-capable", "yes"],
      ["application-name", "우리 가족"],
      ["apple-mobile-web-app-capable", "yes"],
      ["apple-mobile-web-app-title", "우리 가족"],
      ["apple-mobile-web-app-status-bar-style", "default"],
    ];
    metas.forEach(([name, content]) => {
      if (document.querySelector(`meta[name="${name}"]`)) return;
      const meta = document.createElement("meta");
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
    });
  };

  const installGuide = () => {
    if (isSamsungInternet) return "상단 설치 아이콘을 누르거나 메뉴에서 ‘앱 설치’를 선택하세요.";
    if (isAndroid) return "Chrome 메뉴(⋮)에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택하세요.";
    return "브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.";
  };

  const updateCard = () => {
    if (!card) return;
    const installButton = card.querySelector("#galaxyInstallButton");
    const guideButton = card.querySelector("#galaxyInstallGuideButton");
    const status = card.querySelector("#galaxyInstallStatus");
    const installed = isStandalone();

    card.classList.toggle("installed", installed);
    installButton.hidden = installed;
    guideButton.hidden = installed;

    if (installed) {
      status.className = "galaxy-install-status success";
      status.textContent = "설치 완료 · 앱 화면에서 바로 실행할 수 있어요.";
      return;
    }
    if (!navigator.onLine) {
      status.className = "galaxy-install-status offline";
      status.textContent = navigator.serviceWorker?.controller
        ? "오프라인 모드 · 저장된 화면으로 실행 중이에요."
        : "인터넷 연결 후 설치할 수 있어요.";
      return;
    }
    if (deferredInstallPrompt) {
      status.className = "galaxy-install-status ready";
      status.textContent = "설치 준비 완료 · 아래 버튼을 누르면 앱으로 추가돼요.";
      return;
    }
    status.className = "galaxy-install-status guide";
    status.textContent = installGuide();
  };

  const promptInstall = async () => {
    if (isStandalone()) return updateCard();
    if (!deferredInstallPrompt) {
      const message = installGuide();
      if (typeof toast === "function") toast(message);
      updateCard();
      return;
    }

    const installButton = card?.querySelector("#galaxyInstallButton");
    if (installButton) installButton.disabled = true;
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (choice?.outcome === "accepted" && typeof toast === "function") toast("우리 가족 앱을 설치하고 있어요 📱");
    } catch (error) {
      console.error("갤럭시 앱 설치 시작 실패", error);
      if (typeof toast === "function") toast("브라우저 메뉴에서 앱 설치를 선택해 주세요");
    } finally {
      if (installButton) installButton.disabled = false;
      updateCard();
    }
  };

  const registerServiceWorker = async () => {
    if (!("serviceWorker" in navigator)) return null;
    if (registration) return registration;
    try {
      registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "./", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      registration.update().catch(() => {});
      updateCard();
      return registration;
    } catch (error) {
      console.error("앱 서비스 워커 등록 실패", error);
      updateCard();
      return null;
    }
  };

  const installCard = () => {
    if (document.getElementById(CARD_ID)) {
      card = document.getElementById(CARD_ID);
      updateCard();
      return true;
    }
    const settingsView = document.getElementById("settingsView");
    if (!settingsView) return false;

    card = document.createElement("section");
    card.id = CARD_ID;
    card.className = "settings-card galaxy-install-card";
    card.innerHTML = `
      <div class="settings-heading">
        <span class="settings-mark galaxy-install-mark" aria-hidden="true">▣</span>
        <div>
          <p class="eyebrow">GALAXY APP</p>
          <h2>갤럭시 앱 설치</h2>
          <span>브라우저 주소창 없이 독립 앱처럼 실행해요.</span>
        </div>
        <span class="galaxy-install-badge">PWA</span>
      </div>
      <div class="galaxy-install-preview" aria-hidden="true">
        <span class="galaxy-install-icon"><i></i><i></i><i></i></span>
        <p><strong>우리 가족</strong><small>일정 · 성장일기 · 알림</small></p>
        <b>앱 화면</b>
      </div>
      <div class="galaxy-install-actions">
        <button id="galaxyInstallButton" class="galaxy-install-primary" type="button">앱 설치</button>
        <button id="galaxyInstallGuideButton" type="button">설치 방법</button>
      </div>
      <p id="galaxyInstallStatus" class="galaxy-install-status" aria-live="polite"></p>
      <p class="galaxy-install-note"><strong>지원</strong><span>Samsung Internet · Chrome · 홈 화면 푸시 알림 · 오프라인 앱 화면</span></p>`;
    settingsView.appendChild(card);

    card.querySelector("#galaxyInstallButton").addEventListener("click", promptInstall);
    card.querySelector("#galaxyInstallGuideButton").addEventListener("click", () => {
      if (typeof toast === "function") toast(installGuide());
      updateCard();
    });
    updateCard();
    return true;
  };

  const mountCard = (attempt = 0) => {
    if (!installCard() && attempt < 60) setTimeout(() => mountCard(attempt + 1), 100);
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateCard();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updateCard();
    if (typeof toast === "function") toast("우리 가족 앱 설치 완료 🎉");
  });
  window.addEventListener("online", updateCard);
  window.addEventListener("offline", updateCard);
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", updateCard);

  ensureMetadata();
  registerServiceWorker();
  mountCard();
})();
