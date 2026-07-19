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
  button.setAttribute('aria-label', '최신 기록 새로고침');
  button.setAttribute('title', '새로고침');
  button.innerHTML = '<span aria-hidden="true">↻</span>';
  pageBody.appendChild(button);

  const showCompleteToast = () => {
    const toast = document.querySelector('#toast');
    const message = document.querySelector('#toastMessage');
    const action = document.querySelector('#toastAction');
    if (!toast || !message || toast.classList.contains('show')) return;
    message.textContent = '최신 기록으로 갱신했어요';
    if (action) action.hidden = true;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2200);
  };

  const createScrollCheckpoint = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    let cancelled = false;
    let completed = false;
    const passiveOptions = { passive: true };

    const removeInteractionListeners = () => {
      window.removeEventListener('touchstart', cancelRestore, passiveOptions);
      window.removeEventListener('pointerdown', cancelRestore, passiveOptions);
      window.removeEventListener('wheel', cancelRestore, passiveOptions);
      window.removeEventListener('keydown', cancelRestore);
    };

    const cancelRestore = () => {
      cancelled = true;
      removeInteractionListeners();
    };

    window.addEventListener('touchstart', cancelRestore, passiveOptions);
    window.addEventListener('pointerdown', cancelRestore, passiveOptions);
    window.addEventListener('wheel', cancelRestore, passiveOptions);
    window.addEventListener('keydown', cancelRestore);

    const apply = () => {
      if (cancelled || completed) return;
      const maxScrollTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(scrollTop, maxScrollTop));
    };

    return {
      restore() {
        if (cancelled || completed) return removeInteractionListeners();
        window.requestAnimationFrame(() => {
          apply();
          window.setTimeout(apply, 120);
          window.setTimeout(() => {
            apply();
            completed = true;
            removeInteractionListeners();
          }, 450);
        });
      },
    };
  };

  try {
    if (sessionStorage.getItem('family-refresh-complete-v1') === '1') {
      sessionStorage.removeItem('family-refresh-complete-v1');
      window.setTimeout(showCompleteToast, 450);
    }
  } catch { /* 세션 저장이 막혀도 새로고침 기능은 유지 */ }

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const scrollCheckpoint = createScrollCheckpoint();
    button.disabled = true;
    button.classList.add('refreshing');
    button.setAttribute('aria-busy', 'true');
    try {
      if (typeof bootstrapData !== 'function') throw new Error('refresh unavailable');
      const loaded = await bootstrapData();
      if (!loaded) throw new Error('refresh failed');
      showCompleteToast();
    } catch (error) {
      console.error('최신 기록 갱신 실패', error);
      if (typeof toast === 'function') toast('새로고침하지 못했어요. 다시 시도해 주세요');
    } finally {
      scrollCheckpoint.restore();
      button.disabled = false;
      button.classList.remove('refreshing');
      button.removeAttribute('aria-busy');
    }
  });
})();
