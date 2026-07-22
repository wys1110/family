(() => {
  const VIEW_NAME = 'settings';
  let maintainFrame = 0;
  let settingsObserver = null;

  const isSettingsVisible = () => {
    const view = document.querySelector('#settingsView');
    return Boolean(view && !view.hidden);
  };

  const fallbackDeepRefresh = () => {
    try { sessionStorage.setItem('family-refresh-complete-v1', '1'); }
    catch { /* 세션 저장이 막혀도 새로고침은 계속 */ }

    const target = new URL(window.location.href);
    target.searchParams.delete('__appv');
    target.searchParams.set('__refresh', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    window.location.replace(target.href);
  };

  const ensureFloatingRefreshButton = () => {
    const pageBody = document.body;
    if (!pageBody) return null;

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
    button.style.setProperty('display', 'grid', 'important');
    button.style.setProperty('visibility', 'visible', 'important');
    button.style.setProperty('opacity', '1', 'important');
    button.style.setProperty('pointer-events', 'auto', 'important');

    if (button.dataset.refreshHydrated !== 'true' && button.dataset.settingsRefreshFallbackBound !== 'true') {
      button.dataset.settingsRefreshFallbackBound = 'true';
      button.addEventListener('click', () => {
        if (button.dataset.refreshHydrated === 'true' || button.disabled) return;
        button.disabled = true;
        button.classList.add('refreshing');
        button.setAttribute('aria-busy', 'true');
        fallbackDeepRefresh();
      });
    }

    return button;
  };

  const createRefreshCard = () => {
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

    const action = card.querySelector('[data-settings-refresh-action]');
    action.addEventListener('click', () => {
      if (action.disabled) return;
      const globalButton = ensureFloatingRefreshButton();
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
    return card;
  };

  const ensureRefreshCard = () => {
    const settingsView = document.querySelector('#settingsView');
    if (!settingsView) return null;

    let card = settingsView.querySelector('[data-settings-refresh-module]');
    if (!card) {
      card = createRefreshCard();
      settingsView.appendChild(card);
    }

    const familyCard = settingsView.querySelector('.family-profile-settings');
    if (familyCard && familyCard.nextElementSibling !== card) {
      familyCard.insertAdjacentElement('afterend', card);
    } else if (!familyCard && settingsView.firstElementChild !== card) {
      settingsView.insertBefore(card, settingsView.firstElementChild);
    }

    if (!settingsObserver) {
      settingsObserver = new MutationObserver(() => scheduleMaintain());
      settingsObserver.observe(settingsView, { attributes: true, attributeFilter: ['hidden'] });
    }
    return card;
  };

  const maintain = () => {
    const active = isSettingsVisible();
    document.body?.classList.toggle('settings-refresh-active', active);
    ensureRefreshCard();
    if (active) ensureFloatingRefreshButton();
  };

  const scheduleMaintain = () => {
    if (maintainFrame) return;
    maintainFrame = window.requestAnimationFrame(() => {
      maintainFrame = 0;
      maintain();
    });
  };

  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.(`[data-view="${VIEW_NAME}"]`);
    if (!tab) return;
    window.setTimeout(scheduleMaintain, 0);
    window.setTimeout(scheduleMaintain, 180);
  }, true);

  window.addEventListener('pageshow', scheduleMaintain);
  window.addEventListener('familycontextchange', scheduleMaintain);

  const bodyObserver = new MutationObserver(scheduleMaintain);
  if (document.body) bodyObserver.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => {
    bodyObserver.disconnect();
    settingsObserver?.disconnect();
  }, { once: true });

  maintain();
})();
