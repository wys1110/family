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
    const root = document.documentElement;
    const scrollTop = window.scrollY || root.scrollTop || 0;
    const preservedHeight = Math.max(root.scrollHeight, pageBody.scrollHeight);
    const previousMinHeight = pageBody.style.minHeight;
    const previousScrollBehavior = root.style.scrollBehavior;
    let cancelled = false;
    let restoring = false;
    let completed = false;
    let stylesReleased = false;
    const passiveOptions = { passive: true };

    // Prevent the temporary empty render from shortening the document and
    // clamping Safari to the top while remote data is still loading.
    pageBody.style.minHeight = `${preservedHeight}px`;
    root.style.scrollBehavior = 'auto';

    const releaseTemporaryStyles = () => {
      if (stylesReleased) return;
      stylesReleased = true;
      pageBody.style.minHeight = previousMinHeight;
      root.style.scrollBehavior = previousScrollBehavior;
    };

    const removeInteractionListeners = () => {
      window.removeEventListener('touchstart', cancelRestore, passiveOptions);
      window.removeEventListener('pointerdown', cancelRestore, passiveOptions);
      window.removeEventListener('wheel', cancelRestore, passiveOptions);
      window.removeEventListener('keydown', cancelRestore);
    };

    const cancelRestore = () => {
      cancelled = true;
      releaseTemporaryStyles();
      removeInteractionListeners();
    };

    window.addEventListener('touchstart', cancelRestore, passiveOptions);
    window.addEventListener('pointerdown', cancelRestore, passiveOptions);
    window.addEventListener('wheel', cancelRestore, passiveOptions);
    window.addEventListener('keydown', cancelRestore);

    const apply = () => {
      if (cancelled || completed) return;
      const maxScrollTop = Math.max(0, root.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(scrollTop, maxScrollTop));
    };

    return {
      restore() {
        if (completed || restoring) return;
        if (cancelled) {
          releaseTemporaryStyles();
          return removeInteractionListeners();
        }
        restoring = true;
        releaseTemporaryStyles();
        // Restore before the next paint, then verify once on the following frame.
        apply();
        window.requestAnimationFrame(() => {
          apply();
          completed = true;
          removeInteractionListeners();
        });
      },
    };
  };

  const refreshWithStableViewport = async (scrollCheckpoint) => {
    let loaded = false;
    const runRefresh = async () => {
      try {
        loaded = await bootstrapData();
        return loaded;
      } finally {
        scrollCheckpoint.restore();
      }
    };

    if (typeof document.startViewTransition !== 'function') return runRefresh();

    const transitionStyle = document.createElement('style');
    transitionStyle.dataset.refreshTransition = '';
    transitionStyle.textContent = `
      ::view-transition-old(root),
      ::view-transition-new(root) {
        animation: none !important;
      }
    `;
    document.head.appendChild(transitionStyle);

    try {
      // Keep the current viewport snapshot visible until the refreshed DOM and
      // original scroll position are both ready, then swap without animation.
      const transition = document.startViewTransition(runRefresh);
      await transition.finished;
      return loaded;
    } finally {
      transitionStyle.remove();
    }
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
      const loaded = await refreshWithStableViewport(scrollCheckpoint);
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
