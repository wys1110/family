(() => {
  const pageBody = document.body;
  if (!pageBody) return;

  // Keep both floating actions as direct body children. A transformed or filtered
  // app container can otherwise make position: fixed behave like position: absolute
  // on mobile Safari and leave the buttons halfway down the document.
  const addEventButton = document.querySelector('#addEventButton');
  if (addEventButton && addEventButton.parentElement !== pageBody) {
    pageBody.appendChild(addEventButton);
  }

  const existingButton = document.querySelector('[data-refresh-module]');
  if (existingButton) {
    if (existingButton.parentElement !== pageBody) pageBody.appendChild(existingButton);
    return;
  }

  const button = document.createElement('button');
  button.id = 'refreshButton';
  button.className = 'refresh-button';
  button.type = 'button';
  button.dataset.refreshModule = '';
  button.setAttribute('aria-label', '페이지 완전 새로고침');
  button.setAttribute('title', '완전 새로고침');
  button.innerHTML = '<span aria-hidden="true">↻</span>';
  pageBody.appendChild(button);

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
