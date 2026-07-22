(() => {
  const pageBody = document.body;
  if (!pageBody) return;

  // Keep the top-right utilities as a direct body child and freeze their
  // viewport coordinates. Mobile Safari changes visualViewport values while
  // its browser chrome opens/closes; recalculating during that cycle made the
  // notification/account buttons visibly jump between views.
  const topbarActions = document.querySelector('.topbar-account-actions');
  let lockedTop = null;
  let lockedRight = null;

  const installTopbarLockStyle = () => {
    if (document.querySelector('style[data-topbar-position-lock]')) return;
    const style = document.createElement('style');
    style.dataset.topbarPositionLock = '';
    style.textContent = `
      body > .topbar-account-actions,
      body > .topbar-account-actions > button {
        animation: none !important;
        transition: none !important;
      }
      body > .topbar-account-actions > button:active {
        transform: none !important;
      }
    `;
    document.head.appendChild(style);
  };

  const defaultAnchor = () => {
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    return {
      top: desktop ? 20 : 16,
      right: desktop ? Math.max(16, Math.round((viewportWidth - 820) / 2 + 16)) : 16,
    };
  };

  const pinTopbarActions = ({ reset = false } = {}) => {
    if (!topbarActions) return;

    const beforeMove = topbarActions.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    if (topbarActions.parentElement !== pageBody) pageBody.appendChild(topbarActions);

    if (reset || lockedTop === null || lockedRight === null) {
      const fallback = defaultAnchor();
      const measuredRight = viewportWidth - beforeMove.right;
      lockedTop = reset || !Number.isFinite(beforeMove.top) || beforeMove.top < 0
        ? fallback.top
        : Math.round(beforeMove.top);
      lockedRight = reset || !Number.isFinite(measuredRight) || measuredRight < 0
        ? fallback.right
        : Math.round(measuredRight);
    }

    topbarActions.style.setProperty('position', 'fixed', 'important');
    topbarActions.style.setProperty('z-index', '1100', 'important');
    topbarActions.style.setProperty('top', `${lockedTop}px`, 'important');
    topbarActions.style.setProperty('right', `${lockedRight}px`, 'important');
    topbarActions.style.setProperty('bottom', 'auto', 'important');
    topbarActions.style.setProperty('left', 'auto', 'important');
    topbarActions.style.setProperty('margin', '0', 'important');
    topbarActions.style.setProperty('transform', 'none', 'important');
    topbarActions.style.setProperty('translate', 'none', 'important');
    topbarActions.style.setProperty('animation', 'none', 'important');
    topbarActions.style.setProperty('transition', 'none', 'important');
    topbarActions.style.setProperty('will-change', 'auto', 'important');
  };

  installTopbarLockStyle();
  pinTopbarActions();

  let pinFrame = 0;
  const scheduleTopbarPin = (options) => {
    if (pinFrame) return;
    pinFrame = window.requestAnimationFrame(() => {
      pinFrame = 0;
      pinTopbarActions(options);
    });
  };

  // Do not listen to visualViewport scroll/resize. Those events are caused by
  // Safari's address bar and keyboard and must not move these controls.
  window.addEventListener('pageshow', () => scheduleTopbarPin());
  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => scheduleTopbarPin({ reset: true }), 220);
  }, { passive: true });

  if (topbarActions) {
    const topbarParentObserver = new MutationObserver(() => {
      if (topbarActions.parentElement !== pageBody) scheduleTopbarPin();
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
