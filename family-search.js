(() => {
  if (document.querySelector('[data-family-search-module]')) return;

  const topbarActions = document.querySelector('.topbar-account-actions');
  if (!topbarActions) return;

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
  const typeLabels = { event: '일정', growth: '성장', todo: '할 일' };
  let query = '';
  let filter = 'all';

  const button = document.createElement('button');
  button.id = 'familySearchButton';
  button.className = 'family-search-button';
  button.type = 'button';
  button.dataset.familySearchModule = '';
  button.setAttribute('aria-label', '가족 기록 검색');
  button.innerHTML = '<span aria-hidden="true">⌕</span>';
  topbarActions.insertBefore(button, topbarActions.querySelector('#accountButton'));

  const dialog = document.createElement('dialog');
  dialog.id = 'familySearchDialog';
  dialog.className = 'family-search-dialog';
  dialog.setAttribute('aria-labelledby', 'familySearchTitle');
  dialog.innerHTML = `
    <div class="family-search-panel">
      <div class="sheet-handle"></div>
      <header class="family-search-header">
        <div><p class="eyebrow">FAMILY SEARCH</p><h2 id="familySearchTitle">가족 기록 검색</h2></div>
        <button class="close-button" type="button" data-family-search-close aria-label="검색 닫기">×</button>
      </header>
      <label class="family-search-input-wrap" for="familySearchInput">
        <span aria-hidden="true">⌕</span>
        <input id="familySearchInput" type="search" autocomplete="off" placeholder="일정, 성장 기록, 할 일을 검색" />
      </label>
      <div class="family-search-filters" role="tablist" aria-label="검색 유형">
        <button type="button" data-family-search-filter="all" role="tab">전체</button>
        <button type="button" data-family-search-filter="event" role="tab">일정</button>
        <button type="button" data-family-search-filter="growth" role="tab">성장</button>
        <button type="button" data-family-search-filter="todo" role="tab">할 일</button>
      </div>
      <div class="family-search-results" id="familySearchResults" aria-live="polite"></div>
      <p class="family-search-status" id="familySearchStatus">가족 공간 안의 기록만 검색해요.</p>
    </div>`;
  document.body.appendChild(dialog);

  const input = dialog.querySelector('#familySearchInput');
  const results = dialog.querySelector('#familySearchResults');
  const status = dialog.querySelector('#familySearchStatus');

  const snapshot = () => ({
    events: typeof state !== 'undefined' && Array.isArray(state.events) ? state.events : [],
    growthEntries: typeof state !== 'undefined' && Array.isArray(state.growthEntries) ? state.growthEntries : [],
    todos: window.FAMILY_TODO_API?.getSnapshot?.() || [],
  });

  const resultRecords = () => window.FAMILY_UTILITY_API?.searchRecords?.({ ...snapshot(), query, filter }) || [];

  const render = () => {
    dialog.querySelectorAll('[data-family-search-filter]').forEach((tab) => {
      const active = tab.dataset.familySearchFilter === filter;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    const records = resultRecords();
    status.textContent = query ? `${records.length}개 기록을 찾았어요.` : '가족 공간 안의 기록만 검색해요.';
    if (!query) {
      results.innerHTML = '<div class="family-search-empty"><span aria-hidden="true">⌕</span><strong>검색어를 입력해 주세요</strong><small>일정·성장 기록·할 일을 한 번에 찾아요.</small></div>';
      return;
    }
    if (!records.length) {
      results.innerHTML = '<div class="family-search-empty"><span aria-hidden="true">·</span><strong>검색 결과가 없어요</strong><small>다른 단어나 전체 필터로 다시 찾아보세요.</small></div>';
      return;
    }
    results.innerHTML = records.map((record) => `
      <button type="button" class="family-search-result" data-family-search-result data-type="${record.type}" data-id="${escapeHtml(record.id)}" aria-label="${escapeHtml(`${typeLabels[record.type] || '기록'} ${record.title} ${record.date || ''}`)}">
        <span class="family-search-result-type">${typeLabels[record.type] || '기록'}</span>
        <span class="family-search-result-copy"><strong>${escapeHtml(record.title)}</strong><small>${escapeHtml([record.date, record.subtitle].filter(Boolean).join(' · '))}</small></span>
        <span aria-hidden="true">›</span>
      </button>`).join('');
  };

  const openRecord = (record) => {
    const rows = snapshot();
    dialog.close();
    query = '';
    input.value = '';
    if (record.type === 'event') return typeof openEventDialog === 'function' && openEventDialog(rows.events.find((item) => String(item.id) === record.id));
    if (record.type === 'growth') return typeof openGrowthDialog === 'function' && openGrowthDialog(rows.growthEntries.find((item) => String(item.id) === record.id));
    return window.FAMILY_TODO_API?.open?.(rows.todos.find((item) => String(item.id) === record.id));
  };

  button.addEventListener('click', () => {
    render();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.hidden = false;
    setTimeout(() => input.focus(), 0);
  });
  input.addEventListener('input', () => {
    query = input.value.trim();
    render();
  });
  dialog.querySelector('.family-search-filters').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-family-search-filter]');
    if (!tab) return;
    filter = tab.dataset.familySearchFilter || 'all';
    render();
    input.focus();
  });
  results.addEventListener('click', (event) => {
    const item = event.target.closest('[data-family-search-result]');
    if (item) openRecord({ type: item.dataset.type, id: item.dataset.id });
  });
  dialog.querySelector('[data-family-search-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    query = '';
    filter = 'all';
    input.value = '';
    render();
  });
  window.addEventListener('familycontextchange', () => {
    query = '';
    input.value = '';
    if (dialog.open) render();
  });
  render();
})();
