(() => {
  const pageBody = document.body;
  if (!pageBody) return;

  // Keep the top-right utilities as a direct body child and re-assert the
  // viewport anchor. iOS can otherwise reattach a fixed element to a scrolling
  // containing block while views, filters, or the visual viewport are changing.
  const topbarActions = document.querySelector('.topbar-account-actions');
  const pinTopbarActions = () => {
    if (!topbarActions) return;
    if (topbarActions.parentElement !== pageBody) pageBody.appendChild(topbarActions);

    const desktop = window.matchMedia('(min-width: 768px)').matches;
    topbarActions.style.setProperty('position', 'fixed', 'important');
    topbarActions.style.setProperty('z-index', '1100', 'important');
    topbarActions.style.setProperty(
      'top',
      desktop
        ? 'calc(max(18px, env(safe-area-inset-top, 0px)) + 2px)'
        : 'calc(max(12px, env(safe-area-inset-top, 0px)) + 4px)',
      'important',
    );
    topbarActions.style.setProperty('right', 'max(16px, calc((100vw - 820px) / 2 + 16px))', 'important');
    topbarActions.style.setProperty('bottom', 'auto', 'important');
    topbarActions.style.setProperty('left', 'auto', 'important');
    topbarActions.style.setProperty('margin', '0', 'important');
    topbarActions.style.setProperty('transform', 'none', 'important');
    topbarActions.style.setProperty('translate', 'none', 'important');
    topbarActions.style.setProperty('animation', 'none', 'important');
    topbarActions.style.setProperty('transition', 'none', 'important');
  };

  pinTopbarActions();
  let pinFrame = 0;
  const scheduleTopbarPin = () => {
    if (pinFrame) return;
    pinFrame = window.requestAnimationFrame(() => {
      pinFrame = 0;
      pinTopbarActions();
    });
  };

  window.addEventListener('pageshow', scheduleTopbarPin);
  window.addEventListener('resize', scheduleTopbarPin, { passive: true });
  window.addEventListener('orientationchange', scheduleTopbarPin, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleTopbarPin, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleTopbarPin, { passive: true });

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