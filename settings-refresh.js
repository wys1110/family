(() => {
  if (document.querySelector('[data-settings-refresh-module]')) return;

  const keepFloatingRefreshVisible = () => {
    const button = document.querySelector('[data-refresh-module]');
    if (!button) return;
    button.hidden = false;
    button.removeAttribute('aria-hidden');
  };

  const fallbackDeepRefresh = () => {
    try { sessionStorage.setItem('family-refresh-complete-v1', '1'); }
    catch { /* 세션 저장이 막혀도 새로고침은 계속 */ }

    const target = new URL(window.location.href);
    target.searchParams.delete('__appv');
    target.searchParams.set('__refresh', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    window.location.replace(target.href);
  };

  const install = () => {
    const settingsView = document.querySelector('#settingsView');
    if (!settingsView) return false;

    const card = document.createElement('section');
    card.className = 'settings-card settings-refresh-settings';
    card.dataset.settingsRefreshModule = '';
    card.setAttribute('aria-labelledby', 'settingsRefreshTitle');
    card.innerHTML = `
      <div class="settings-heading">
        <span class="settings-mark settings-refresh-mark" aria-hidden="true"></span>
        <div>
          <p class="eyebrow">앱 관리</p>
          <h2 id="settingsRefreshTitle">새로고침</h2>
          <span>최신 화면과 데이터를 다시 불러옵니다.</span>
        </div>
      </div>
      <button class="settings-refresh-action" type="button" data-settings-refresh-action>
        <span aria-hidden="true"></span>
        지금 새로고침
      </button>
    `;

    const familyCard = settingsView.querySelector('.family-profile-settings');
    const firstCard = settingsView.querySelector('.settings-card');
    if (familyCard) familyCard.insertAdjacentElement('afterend', card);
    else if (firstCard) settingsView.insertBefore(card, firstCard);
    else settingsView.appendChild(card);

    const action = card.querySelector('[data-settings-refresh-action]');
    action.addEventListener('click', () => {
      if (action.disabled) return;
      keepFloatingRefreshVisible();

      const globalButton = document.querySelector('[data-refresh-module]');
      action.disabled = true;
      action.classList.add('refreshing');
      action.setAttribute('aria-busy', 'true');

      if (globalButton && !globalButton.disabled) {
        globalButton.click();
        window.setTimeout(() => {
          action.disabled = false;
          action.classList.remove('refreshing');
          action.removeAttribute('aria-busy');
        }, 2500);
        return;
      }

      fallbackDeepRefresh();
    });

    const visibilityObserver = new MutationObserver(() => {
      if (!settingsView.hidden) keepFloatingRefreshVisible();
    });
    visibilityObserver.observe(settingsView, { attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('pagehide', () => visibilityObserver.disconnect(), { once: true });

    document.querySelector('[data-view="settings"]')?.addEventListener('click', () => {
      window.requestAnimationFrame(keepFloatingRefreshVisible);
    });

    keepFloatingRefreshVisible();
    return true;
  };

  if (install()) return;
  let attempts = 0;
  const retry = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 40) window.clearInterval(retry);
  }, 100);
})();
