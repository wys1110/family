(() => {
  if (document.querySelector('[data-family-guide-module]')) return;

  const VIEW_NAME = 'guide';
  const STORAGE_KEY = 'family-guide-settings-v1';
  const ACTIVE_VIEW_KEY = 'family-active-view-v1';
  const dataApi = window.FAMILY_GUIDE_DATA_API;
  const navigation = document.querySelector('.view-tabs');
  const main = document.querySelector('.app-shell main');
  if (!dataApi || !navigation || !main) return;

  const phaseLabels = { prenatal: '출산 전', postpartum: '산후·신생아', infant: '영아', toddler: '유아' };
  const phaseButtons = [['current', '현재 단계'], ['all', '전체 단계']];
  const categories = [...new Set(dataApi.cards.map((card) => card.category))];
  const defaultProfileSettings = () => ({ dueDate: '', birthDate: '', region: { sido: '', sigungu: '' }, hiddenCardIds: [], completedCardIds: [] });
  const defaultSettings = () => ({ profiles: {} });
  let settings = defaultSettings();
  let phaseFilter = 'current';
  let categoryFilter = 'all';
  let statusFilter = 'all';
  let lastVisibleCards = [];

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const isDemo = () => window.FAMILY_DEMO_MODE === true;
  const storageKey = () => {
    if (isDemo()) return `${STORAGE_KEY}:demo`;
    if (typeof state !== 'undefined' && state.session?.user?.id && state.household?.id) {
      return `${STORAGE_KEY}:${state.session.user.id}:${state.household.id}`;
    }
    return `${STORAGE_KEY}:device`;
  };
  const cleanDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
  const cleanProfileSettings = (value = {}) => ({
    dueDate: cleanDate(value.dueDate),
    birthDate: cleanDate(value.birthDate),
    region: { sido: String(value.region?.sido || ''), sigungu: String(value.region?.sigungu || '') },
    hiddenCardIds: Array.isArray(value.hiddenCardIds) ? [...new Set(value.hiddenCardIds.map(String))] : [],
    completedCardIds: Array.isArray(value.completedCardIds) ? [...new Set(value.completedCardIds.map(String))] : [],
  });
  const cleanSettings = (value = {}) => {
    if (value.profiles && typeof value.profiles === 'object' && !Array.isArray(value.profiles)) {
      return { profiles: Object.fromEntries(Object.entries(value.profiles).map(([id, profile]) => [String(id), cleanProfileSettings(profile)])) };
    }
    return { profiles: { unlinked: cleanProfileSettings(value) } };
  };
  const currentBaby = () => {
    try { return typeof activeBaby === 'function' ? activeBaby() : null; }
    catch { return null; }
  };
  const currentBabyId = () => String(currentBaby()?.id || (typeof state !== 'undefined' && state.activeBabyId) || 'unlinked');
  const readSettings = () => {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(storageKey()) || 'null') || {}; }
    catch { return defaultSettings(); }
    const next = cleanSettings(parsed);
    const babyId = currentBabyId();
    if (babyId !== 'unlinked' && !next.profiles[babyId] && next.profiles.unlinked) {
      next.profiles[babyId] = next.profiles.unlinked;
      delete next.profiles.unlinked;
      try { localStorage.setItem(storageKey(), JSON.stringify(next)); } catch { /* 저장이 막힌 브라우저에서는 현재 화면만 유지 */ }
    }
    return next;
  };
  const persist = () => {
    try { localStorage.setItem(storageKey(), JSON.stringify(settings)); }
    catch { /* 저장이 막힌 브라우저에서는 현재 화면만 유지 */ }
  };
  const currentProfile = () => settings.profiles[currentBabyId()] || defaultProfileSettings();
  const updateProfile = (next) => {
    const id = currentBabyId();
    const profile = currentProfile();
    settings = { profiles: { ...settings.profiles, [id]: cleanProfileSettings({ ...profile, ...next, region: { ...profile.region, ...(next.region || {}) } }) } };
    persist();
    render();
  };
  const phaseInfo = () => {
    const profile = currentProfile();
    const baby = currentBaby();
    return dataApi.calculatePhase(dataApi.profilePhaseInput(profile, baby));
  };
  const regionReady = () => Boolean(currentProfile().region.sido);

  const tab = navigation.querySelector(`[data-view="${VIEW_NAME}"]`) || document.createElement('button');
  if (!tab.parentElement) {
    tab.className = 'view-tab';
    tab.dataset.view = VIEW_NAME;
    tab.type = 'button';
    tab.textContent = '가이드';
    navigation.appendChild(tab);
  }

  const view = document.createElement('div');
  view.id = 'guideView';
  view.className = 'settings-view guide-view';
  view.dataset.familyGuideModule = '';
  view.hidden = true;
  view.innerHTML = `
    <section class="guide-intro-card" aria-labelledby="guideTitle">
      <div class="guide-intro-heading"><span class="guide-mark" aria-hidden="true">⌂</span><div><p class="eyebrow">FAMILY GUIDE</p><span data-guide-baby-name>아기 프로필 미선택</span><h2 id="guideTitle">준비·육아 가이드</h2><span data-guide-date-hint>아기 프로필이 있으면 생년월일을 자동으로 사용하고, 없으면 예정일을 입력해요.</span></div></div>
      <div class="guide-setup-grid">
        <label data-guide-due-field><span>예정일</span><input type="date" data-guide-due-date></label>
        <label><span>출산일</span><input type="date" data-guide-birth-date></label>
        <label class="guide-sido-field"><span>시·도</span><select data-guide-sido><option value="">선택 안 함</option>${dataApi.regions.filter((region) => region !== '전국').map((region) => `<option value="${esc(region)}">${esc(region)}</option>`).join('')}</select></label>
        <label class="guide-sigungu-field"><span>시·군·구</span><input type="text" data-guide-sigungu list="guideSigunguList" placeholder="선택 입력"></label>
      </div>
      <p class="guide-privacy-note"><span aria-hidden="true">✓</span> 가이드 설정은 일정·성장 기록과 분리 저장돼요.</p>
      <button type="button" class="guide-restore-button" data-guide-restore-hidden hidden>숨긴 카드 복원</button>
    </section>
    <section class="guide-status-card" aria-live="polite"><div><p class="eyebrow">CURRENT GUIDE</p><strong data-guide-phase>기준일을 설정해 주세요</strong><span data-guide-phase-detail>개인화 전에는 전국 공통 정보를 보여줘요.</span></div><b data-guide-count>0개</b></section>
    <section class="guide-filter-card" aria-label="가이드 필터">
      <div class="guide-filter-row" data-guide-phase-filter role="tablist" aria-label="단계 필터"></div>
      <div class="guide-filter-row" data-guide-category-filter role="group" aria-label="카테고리 필터"></div>
      <div class="guide-filter-row" data-guide-status-filter role="group" aria-label="상태 필터"><button type="button" class="active" data-guide-status="all">전체</button><button type="button" data-guide-status="open">진행 전</button><button type="button" data-guide-status="done">완료</button></div>
    </section>
    <section class="guide-list-section" aria-labelledby="guideListTitle"><div class="guide-list-heading"><div><p class="eyebrow">CHECKLIST</p><h2 id="guideListTitle">확인할 정보</h2></div><span>출처 포함</span></div><div class="guide-card-list" data-guide-list></div></section>`;
  main.appendChild(view);

  const $ = (selector) => view.querySelector(selector);
  const setSettings = (next) => updateProfile(next);
  const getVisibleCards = () => lastVisibleCards.map((card) => ({ ...card }));

  const renderFilters = () => {
    $('[data-guide-phase-filter]').innerHTML = phaseButtons.map(([value, label]) => `<button type="button" data-guide-phase="${value}" class="${phaseFilter === value ? 'active' : ''}">${label}</button>`).join('');
    $('[data-guide-category-filter]').innerHTML = [['all', '모든 주제'], ...categories.map((category) => [category, category])].map(([value, label]) => `<button type="button" data-guide-category="${esc(value)}" class="${categoryFilter === value ? 'active' : ''}">${esc(label)}</button>`).join('');
    view.querySelectorAll('[data-guide-status]').forEach((button) => button.classList.toggle('active', button.dataset.guideStatus === statusFilter));
  };

  const renderCard = (item) => `<article class="guide-info-card${item.completed ? ' is-complete' : ''}" data-guide-card="${esc(item.id)}">
    <div class="guide-card-top"><label class="guide-check"><input type="checkbox" data-guide-complete="${esc(item.id)}" ${item.completed ? 'checked' : ''}><span aria-hidden="true"></span><em>${item.completed ? '완료' : '체크'}</em></label><button type="button" class="guide-hide-button" data-guide-hide="${esc(item.id)}" aria-label="${esc(item.title)} 숨기기">숨기기</button></div>
    <div class="guide-card-copy"><span class="guide-category">${esc(item.category)}</span><h3>${esc(item.title)}</h3><strong>${esc(item.timing)}</strong><p>${esc(item.summary)}</p><small>다음 행동 · ${esc(item.action)}</small></div>
    <footer class="guide-source"><span>출처 · ${esc(item.sourceName)} · 확인 ${esc(item.checkedAt)}</span><a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">원문 보기 <span aria-hidden="true">↗</span></a></footer>
  </article>`;

  const render = () => {
    const profile = currentProfile();
    const baby = currentBaby();
    const info = phaseInfo();
    const phase = phaseFilter === 'current' && info.mode !== 'unknown' ? info.mode : 'all';
    let cards = dataApi.filterCards(dataApi.cards, { phase, category: categoryFilter, region: profile.region, hiddenCardIds: profile.hiddenCardIds, completedCardIds: profile.completedCardIds });
    if (statusFilter === 'open') cards = cards.filter((item) => !item.completed);
    if (statusFilter === 'done') cards = cards.filter((item) => item.completed);
    lastVisibleCards = cards;
    $('[data-guide-baby-name]').textContent = baby?.name ? `${baby.name} 기준` : '아기 프로필 미선택';
    const dueField = $('[data-guide-due-field]');
    dueField.hidden = Boolean(baby?.birthDate);
    $('[data-guide-due-date]').value = baby?.birthDate ? '' : profile.dueDate;
    $('[data-guide-birth-date]').value = baby?.birthDate || profile.birthDate;
    $('[data-guide-birth-date]').disabled = Boolean(baby?.birthDate);
    $('[data-guide-date-hint]').textContent = baby?.birthDate
      ? '성장탭의 아기 생년월일을 기준으로 안내해요.'
      : '아기 프로필이 있으면 생년월일을 자동으로 사용하고, 없으면 예정일을 입력해요.';
    $('[data-guide-sido]').value = profile.region.sido;
    $('[data-guide-sigungu]').value = profile.region.sigungu;
    $('[data-guide-phase]').textContent = info.label;
    $('[data-guide-phase-detail]').textContent = info.mode === 'unknown'
      ? '기준일을 넣으면 현재 단계에 맞춰 우선순위를 좁혀요.'
      : `${phaseLabels[info.mode]} 정보 ${cards.length}개 · 지역 ${regionReady() ? profile.region.sido : '전국 공통'}`;
    $('[data-guide-count]').textContent = `${cards.length}개`;
    const restoreButton = $('[data-guide-restore-hidden]');
    restoreButton.hidden = profile.hiddenCardIds.length === 0;
    restoreButton.textContent = profile.hiddenCardIds.length ? `숨긴 카드 ${profile.hiddenCardIds.length}개 복원` : '숨긴 카드 복원';
    $('[data-guide-list]').innerHTML = cards.length ? cards.map(renderCard).join('') : '<div class="guide-empty"><strong>조건에 맞는 카드가 없어요.</strong><span>필터를 바꾸거나 숨긴 카드를 확인해 보세요.</span></div>';
    renderFilters();
  };

  const installSwitchView = (attempt = 0) => {
    if (typeof switchView !== 'function') { if (attempt < 50) setTimeout(() => installSwitchView(attempt + 1), 100); return; }
    if (switchView.__familyGuideInstalled) return;
    const previous = switchView;
    const enhanced = function (requested) {
      if (requested !== VIEW_NAME) { view.hidden = true; return previous(requested); }
      previous('calendar');
      if (typeof state !== 'undefined') state.activeView = VIEW_NAME;
      try { localStorage.setItem(ACTIVE_VIEW_KEY, VIEW_NAME); } catch { /* 현재 화면만 유지 */ }
      ['calendarView', 'growthView', 'englishView', 'privateView', 'featureRequestView', 'settingsView', 'adminView'].forEach((id) => document.getElementById(id)?.setAttribute('hidden', ''));
      view.hidden = false;
      document.querySelectorAll('.view-tab').forEach((button) => {
        const active = button.dataset.view === VIEW_NAME;
        button.classList.toggle('active', active);
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(active));
      });
      document.querySelector('#addEventButton')?.setAttribute('hidden', '');
      render();
    };
    Object.keys(previous).forEach((key) => { try { enhanced[key] = previous[key]; } catch { /* readonly */ } });
    enhanced.__familyGuideInstalled = true;
    switchView = enhanced;
    let saved = null;
    try { saved = localStorage.getItem(ACTIVE_VIEW_KEY); } catch { /* 기본 탭 */ }
    if (saved === VIEW_NAME) switchView(VIEW_NAME);
  };

  view.addEventListener('change', (event) => {
    const due = event.target.closest('[data-guide-due-date]');
    const birth = event.target.closest('[data-guide-birth-date]');
    if (due || birth) {
      const baby = currentBaby();
      if (baby?.birthDate) return render();
      const profile = currentProfile();
      const next = { dueDate: $('[data-guide-due-date]').value, birthDate: $('[data-guide-birth-date]').value };
      if (next.dueDate && next.birthDate && next.birthDate < next.dueDate) {
        if (typeof toast === 'function') toast('출산일은 예정일 이후 날짜로 입력해 주세요.');
        return render();
      }
      if (next.dueDate === profile.dueDate && next.birthDate === profile.birthDate) return render();
      return setSettings(next);
    }
    if (event.target.closest('[data-guide-sido]')) return setSettings({ region: { sido: $('[data-guide-sido]').value, sigungu: '' } });
  });
  $('[data-guide-sigungu]').addEventListener('change', (event) => setSettings({ region: { sigungu: event.target.value } }));
  view.addEventListener('click', (event) => {
    const phaseButton = event.target.closest('[data-guide-phase]');
    const categoryButton = event.target.closest('[data-guide-category]');
    const statusButton = event.target.closest('[data-guide-status]');
    const hideButton = event.target.closest('[data-guide-hide]');
    const restoreButton = event.target.closest('[data-guide-restore-hidden]');
    if (phaseButton) { phaseFilter = phaseButton.dataset.guidePhase; return render(); }
    if (categoryButton) { categoryFilter = categoryButton.dataset.guideCategory; return render(); }
    if (statusButton) { statusFilter = statusButton.dataset.guideStatus; return render(); }
    const profile = currentProfile();
    if (hideButton) return setSettings({ hiddenCardIds: [...profile.hiddenCardIds, hideButton.dataset.guideHide] });
    if (restoreButton) return setSettings({ hiddenCardIds: [] });
  });
  view.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-guide-complete]');
    if (!checkbox) return;
    const id = checkbox.dataset.guideComplete;
    const profile = currentProfile();
    const completedCardIds = checkbox.checked ? [...profile.completedCardIds, id] : profile.completedCardIds.filter((value) => value !== id);
    setSettings({ completedCardIds });
  });
  tab.addEventListener('click', () => { if (typeof switchView === 'function') switchView(VIEW_NAME); });
  window.addEventListener('familycontextchange', () => { settings = readSettings(); render(); });
  window.addEventListener('familybabychange', () => { settings = readSettings(); render(); });

  settings = readSettings();
  window.FAMILY_GUIDE_API = { getSettings: () => ({ ...currentProfile(), babyId: currentBabyId() }), setSettings, getVisibleCards };
  installSwitchView();
  render();
})();
