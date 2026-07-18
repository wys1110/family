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
