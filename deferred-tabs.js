(() => {
  const api = window.FAMILY_DEFERRED_MODULES;
  if (!api || typeof switchView !== 'function') return;
  const groups = api.groups;
  const loaded = new Set(), pending = new Map();
  let requestId = 0;
  let loadingView = null;
  const nav = document.querySelector('.view-tabs');
  const main = document.querySelector('main');
  const scope = () => `${state.session?.user?.id}|${state.household?.id}`;
  const createTab = (view, text) => {
    if (nav.querySelector(`[data-view="${view}"]`)) return;
    const tab = document.createElement('button');
    tab.className = 'view-tab'; tab.type = 'button'; tab.dataset.view = view; tab.textContent = text;
    if (view === 'english' || view === 'travel') nav.insertBefore(tab, nav.querySelector('[data-view="english"]') || nav.querySelector('[data-view="settings"]'));
    else nav.appendChild(tab);
  };
  createTab('english', '📖 동화');
  createTab('travel', '✈️ 여행');
  const notice = document.createElement('section');
  notice.className = 'settings-card'; notice.hidden = true; notice.setAttribute('role', 'status');
  main.appendChild(notice);
  const renderNotice = (view, error = false) => {
    notice.replaceChildren(); notice.hidden = false;
    const message = document.createElement('p');
    message.textContent = error ? '연결을 확인하고 다시 열어 주세요.' : '내용을 불러오고 있어요…';
    notice.appendChild(message);
    if (error) {
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '다시 시도';
      retry.addEventListener('click', () => window.switchView(view)); notice.appendChild(retry);
    }
  };
  const ensure = view => {
    if (loaded.has(view)) return Promise.resolve();
    if (pending.has(view)) return pending.get(view);
    const task = (async () => {
      // Preserve declared dependency order; successful modules survive a retry.
      for (const name of groups[view]) await api.load(name);
      loaded.add(view);
    })().finally(() => pending.delete(view));
    pending.set(view, task); return task;
  };
  const original = switchView;
  const navigate = function(requestedView) {
    if (loadingView === requestedView && pending.has(requestedView)) return;
    const id = ++requestId;
    if (!groups[requestedView] || loaded.has(requestedView)) {
      notice.hidden = true; loadingView = null;
      return original(requestedView);
    }
    if (requestedView === 'admin' && nav.querySelector('[data-view="admin"]').hidden) return;
    loadingView = requestedView;
    const context = scope();
    // Use the current lightweight settings shell when available.
    original(requestedView === 'settings' ? 'settings' : 'calendar');
    if (requestedView !== 'settings') main.querySelectorAll(':scope > [id$="View"]').forEach(view => { view.hidden = true; });
    state.activeView = requestedView;
    nav.querySelectorAll('.view-tab').forEach(tab => {
      const active = tab.dataset.view === requestedView;
      tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active));
    });
    document.querySelector('#addEventButton').hidden = true;
    try { localStorage.setItem(ACTIVE_VIEW_KEY, requestedView); localStorage.setItem('family-active-view-v1', requestedView); } catch { /* Current view still works. */ }
    renderNotice(requestedView);
    const current = () => requestId === id && scope() === context && state.activeView === requestedView;
    ensure(requestedView).then(() => {
      if (!current()) return;
      notice.hidden = true; loadingView = null;
      window.FAMILY_MOTION_API?.ensureWrapped();
      window.switchView(requestedView);
    }).catch(error => {
      console.warn('탭 로딩 실패', error);
      if (current()) { loadingView = null; renderNotice(requestedView, true); }
    });
  };
  Object.assign(navigate, original);
  switchView = navigate;
  // Unloaded tabs have no feature handler yet. Consume only these clicks.
  document.addEventListener('click', event => {
    const tab = event.target.closest?.('.view-tab[data-view]');
    if (!tab || !groups[tab.dataset.view] || loaded.has(tab.dataset.view)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    window.switchView(tab.dataset.view);
  }, true);
  window.addEventListener('familycontextchange', () => { requestId++; loadingView = null; notice.hidden = true; });
  window.FAMILY_DEFERRED_TABS = {
    ensure,
    restoreInitial: async () => {
      const saved = api.initialView;
      const id = requestId;
      if (groups[saved] && (saved !== 'admin' || !nav.querySelector('[data-view="admin"]').hidden)) {
        await ensure(saved).catch(error => console.warn('저장된 탭 로딩 실패', error));
        if (requestId === id) window.switchView(saved);
      }
    },
  };
})();
