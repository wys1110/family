(() => {
  if (document.querySelector('[data-refresh-module]')) return;

  const topbar = document.querySelector('.topbar');
  const accountButton = document.querySelector('#accountButton');
  if (!topbar || !accountButton) return;

  let actions = topbar.querySelector('.topbar-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'topbar-actions';
    topbar.insertBefore(actions, accountButton);
    actions.appendChild(accountButton);
  }

  const button = document.createElement('button');
  button.id = 'refreshButton';
  button.className = 'refresh-button';
  button.type = 'button';
  button.dataset.refreshModule = '';
  button.setAttribute('aria-label', '최신 기록 새로고침');
  button.setAttribute('title', '새로고침');
  button.innerHTML = '<span aria-hidden="true">↻</span>';
  actions.insertBefore(button, accountButton);
  topbar.classList.add('has-refresh-action');

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

  try {
    if (sessionStorage.getItem('family-refresh-complete-v1') === '1') {
      sessionStorage.removeItem('family-refresh-complete-v1');
      window.setTimeout(showCompleteToast, 450);
    }
  } catch { /* 세션 저장이 막혀도 새로고침 기능은 유지 */ }

  button.addEventListener('click', async () => {
    if (button.disabled) return;
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
      button.disabled = false;
      button.classList.remove('refreshing');
      button.removeAttribute('aria-busy');
    }
  });
})();
