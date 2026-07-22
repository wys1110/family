(() => {
  const pageBody = document.body;
  if (!pageBody) return;

  // Do not keep the top-right controls on Safari's viewport-fixed layer.
  // The browser chrome moves that layer while tabs and the address bar change,
  // so the controls are docked in the header's normal layout instead.
  const topbar = document.querySelector('.topbar');
  const topbarActions = document.querySelector('.topbar-account-actions');

  const actionRailWidth = () => {
    if (window.matchMedia('(min-width: 768px)').matches) return 100;
    if (window.matchMedia('(max-width: 380px)').matches) return 91;
    return 96;
  };

  const installTopbarLockStyle = () => {
    if (document.querySelector('style[data-topbar-position-lock]')) return;
    const style = document.createElement('style');
    style.dataset.topbarPositionLock = '';
    style.textContent = `
      .topbar {
        position: relative !important;
      }
      .topbar > .topbar-account-actions {
        position: static !important;
        z-index: auto !important;
        display: flex !important;
        flex: 0 0 96px !important;
        width: 96px !important;
        min-width: 96px !important;
        max-width: 96px !important;
        align-items: center !important;
        justify-content: flex-end !important;
        gap: 8px !important;
        inset: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        transform: none !important;
        translate: none !important;
        animation: none !important;
        transition: none !important;
        will-change: auto !important;
      }
      .topbar > .topbar-account-actions > button,
      .topbar > .topbar-account-actions > button:active {
        transform: none !important;
        translate: none !important;
        animation: none !important;
        transition: none !important;
      }
      @media (min-width: 768px) {
        .topbar > .topbar-account-actions {
          flex-basis: 100px !important;
          width: 100px !important;
          min-width: 100px !important;
          max-width: 100px !important;
        }
      }
      @media (max-width: 380px) {
        .topbar > .topbar-account-actions {
          flex-basis: 91px !important;
          width: 91px !important;
          min-width: 91px !important;
          max-width: 91px !important;
          gap: 7px !important;
        }
      }
    `;
    document.head.appendChild(style);
  };

  const dockTopbarActions = () => {
    if (!topbar || !topbarActions) return;
    if (topbarActions.parentElement !== topbar) topbar.appendChild(topbarActions);

    const width = actionRailWidth();
    topbar.style.setProperty('position', 'relative', 'important');
    topbarActions.style.setProperty('position', 'static', 'important');
    topbarActions.style.setProperty('z-index', 'auto', 'important');
    topbarActions.style.setProperty('display', 'flex', 'important');
    topbarActions.style.setProperty('flex', `0 0 ${width}px`, 'important');
    topbarActions.style.setProperty('width', `${width}px`, 'important');
    topbarActions.style.setProperty('min-width', `${width}px`, 'important');
    topbarActions.style.setProperty('max-width', `${width}px`, 'important');
    topbarActions.style.setProperty('align-items', 'center', 'important');
    topbarActions.style.setProperty('justify-content', 'flex-end', 'important');
    topbarActions.style.setProperty('gap', width === 91 ? '7px' : '8px', 'important');
    topbarActions.style.setProperty('top', 'auto', 'important');
    topbarActions.style.setProperty('right', 'auto', 'important');
    topbarActions.style.setProperty('bottom', 'auto', 'important');
    topbarActions.style.setProperty('left', 'auto', 'important');
    topbarActions.style.setProperty('inset', 'auto', 'important');
    topbarActions.style.setProperty('margin', '0', 'important');
    topbarActions.style.setProperty('transform', 'none', 'important');
    topbarActions.style.setProperty('translate', 'none', 'important');
    topbarActions.style.setProperty('animation', 'none', 'important');
    topbarActions.style.setProperty('transition', 'none', 'important');
    topbarActions.style.setProperty('will-change', 'auto', 'important');
  };

  installTopbarLockStyle();
  dockTopbarActions();

  let dockFrame = 0;
  const scheduleTopbarDock = () => {
    if (dockFrame) return;
    dockFrame = window.requestAnimationFrame(() => {
      dockFrame = 0;
      dockTopbarActions();
    });
  };

  window.addEventListener('pageshow', scheduleTopbarDock);
  window.addEventListener('orientationchange', () => {
    window.setTimeout(scheduleTopbarDock, 220);
  }, { passive: true });

  if (topbarActions && topbar) {
    const topbarParentObserver = new MutationObserver(() => {
      if (topbarActions.parentElement !== topbar) scheduleTopbarDock();
    });
    topbarParentObserver.observe(pageBody, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => topbarParentObserver.disconnect(), { once: true });
  }

  // Keep both lower floating actions as direct body children so position: fixed
  // stays anchored to the viewport in mobile Safari.
  const addEventButton = document.querySelector('#addEventButton');
  if (addEventButton && addEventButton.parentElement !== pageBody) {
    pageBody.appendChild(addEventButton);
  }

  const growthInsight = document.querySelector('#growthInsightRow');
  if (growthInsight && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      pageBody.classList.toggle('floating-actions-safe-zone-active', entry.isIntersecting);
    });
    observer.observe(growthInsight);
  }

  let button = document.querySelector('[data-refresh-module]');
  if (!button) {
    button = document.createElement('button');
    button.id = 'refreshButton';
    button.className = 'refresh-button';
    button.type = 'button';
    button.dataset.refreshModule = '';
    button.setAttribute('aria-label', '페이지 완전 새로고침');
    button.setAttribute('title', '완전 새로고침');
    button.innerHTML = '<span aria-hidden="true"></span>';
  }

  if (button.parentElement !== pageBody) pageBody.appendChild(button);
  button.hidden = false;
  button.removeAttribute('aria-hidden');
  button.dataset.refreshHydrated = 'true';

  const showCompleteToast = () => {
    const toast = document.querySelector('#toast');
    const message = document.querySelector('#toastMessage');
    const action = document.querySelector('#toastAction');
    if (!toast || !message || toast.classList.contains('show')) return;
    message.textContent = '페이지를 새로 읽어왔어요';
    if (action) action.hidden = true;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2200);
  };

  try {
    if (sessionStorage.getItem('family-refresh-complete-v1') === '1') {
      sessionStorage.removeItem('family-refresh-complete-v1');
      window.setTimeout(showCompleteToast, 450);
    }
  } catch { /* 세션 저장이 막혀도 새로고침 기능은 유지 */ }

  const updateServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;
      await registration.update();
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      console.debug('서비스 워커 확인을 건너뛰었어요', error);
    }
  };

  const deepReload = async () => {
    // Give an updated worker a brief chance to activate, but never make the
    // refresh button feel stuck when the network is slow or unavailable.
    await Promise.race([
      updateServiceWorker(),
      new Promise((resolve) => window.setTimeout(resolve, 900)),
    ]);

    try {
      sessionStorage.setItem('family-refresh-complete-v1', '1');
    } catch { /* 세션 저장이 막혀도 페이지는 다시 읽기 */ }

    // A unique navigation URL bypasses the page cache on iOS standalone mode.
    // config.js is additionally served network-only by the service worker, so
    // the newly loaded page receives the latest module version manifest.
    const target = new URL(window.location.href);
    target.searchParams.delete('__appv');
    target.searchParams.set('__refresh', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    window.location.replace(target.href);
  };

  if (button.dataset.refreshHandlerBound === 'true') return;
  button.dataset.refreshHandlerBound = 'true';
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.classList.add('refreshing');
    button.setAttribute('aria-busy', 'true');

    try {
      await deepReload();
    } catch (error) {
      console.error('페이지 완전 새로고침 실패', error);
      button.disabled = false;
      button.classList.remove('refreshing');
      button.removeAttribute('aria-busy');
      if (typeof toast === 'function') toast('새로고침하지 못했어요. 다시 시도해 주세요');
    }
  });
})();
