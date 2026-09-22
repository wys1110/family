(() => {
  const root = document.documentElement;
  if (root.dataset.compactFamily) return;
  root.dataset.compactFamily = 'true';
  const $ = selector => document.querySelector(selector);
  const heading = $('.topbar h1');
  heading.innerHTML = '<span>하나님과 함께하는</span><strong>우리 가족</strong>';

  // Keep the existing daily verse nodes so the midnight refresh still updates them.
  const verse = $('.daily-verse-card');
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'verse-toggle';
  toggle.textContent = '오늘의 말씀';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'dailyVerseText dailyVerseReference');
  verse.prepend(toggle);
  const setVerse = expanded => {
    verse.dataset.expanded = String(expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? '오늘의 말씀 · 접기' : '오늘의 말씀 · 펼치기';
  };
  setVerse(false);
  toggle.addEventListener('click', () => setVerse(toggle.getAttribute('aria-expanded') !== 'true'));

  const refresh = $('#refreshButton');
  if (refresh) $('.topbar-account-actions').appendChild(refresh);

  const journal = $('#babyJournalContent');
  const timer = $('#careTimerCard');
  const quickGrid = timer.querySelector('.growth-quick-grid');
  const sleep = document.createElement('button');
  sleep.type = 'button'; sleep.dataset.compactSleep = '';
  sleep.innerHTML = '<span class="quick-symbol sleep" aria-hidden="true">☾</span>수면';
  sleep.addEventListener('click', () => openGrowthQuick('수면'));
  quickGrid.appendChild(sleep);

  const summary = document.createElement('section');
  summary.className = 'compact-today'; summary.setAttribute('aria-labelledby', 'compactTodayTitle');
  summary.innerHTML = '<header><h2 id="compactTodayTitle">오늘 요약</h2><time></time></header><div class="compact-today-grid" aria-live="polite"></div>';
  const history = $('#growthView .growth-section');
  const profile = $('#growthView .baby-profile-card');
  const tools = $('#growthView .journal-tools');
  journal.insertBefore(timer, profile.nextSibling);
  timer.after(summary);
  let beforeHistory = summary;
  for (const selector of ['.care-pattern-section', '.integrated-care-summary', '#growthInsightRow']) {
    const node = $(selector);
    if (!node) continue;
    beforeHistory.after(node);
    beforeHistory = node;
  }
  beforeHistory.after(history);
  history.after($('#recentPhotoSection'));
  if (tools) journal.appendChild(tools);

  // Primary actions stay in document flow: no calendar dates or records are covered.
  const action = $('#addEventButton');
  const calendarActions = document.createElement('div');
  calendarActions.className = 'compact-primary-actions';
  $('#calendarView .calendar-card').before(calendarActions);
  const growthActions = document.createElement('div');
  growthActions.className = 'compact-primary-actions';
  timer.appendChild(growthActions);
  const placeAction = () => {
    const target = state.activeView === 'growth' ? growthActions : calendarActions;
    if (action.parentElement !== target) target.appendChild(action);
  };
  const previousSwitch = switchView;
  const navigate = function(...args) { const result = previousSwitch.apply(this, args); placeAction(); return result; };
  Object.assign(navigate, previousSwitch); switchView = navigate;
  placeAction();

  const renderSummary = () => {
    const today = dateKey(new Date());
    const entries = window.FAMILY_DATA.splitSleepEntries(activeBabyEntries()).filter(entry => entry.date === today);
    const sum = (category, field) => entries.filter(entry => entry.category === category).reduce((value, entry) => value + Math.max(0, Number(entry[field]) || 0), 0);
    const metrics = [['수유량', `${sum('수유·이유식', 'feedingMl').toLocaleString('ko-KR')}mL`], ['직수', formatDuration(sum('수유·이유식', 'feedingMinutes'))], ['수면', formatDuration(sum('수면', 'sleepMinutes'))]];
    summary.querySelector('time').textContent = today.slice(5).replace('-', '.');
    summary.querySelector('time').dateTime = today;
    summary.querySelector('.compact-today-grid').replaceChildren(...metrics.map(([label, value]) => {
      const item = document.createElement('div'), caption = document.createElement('span'), amount = document.createElement('strong');
      caption.textContent = label; amount.textContent = value; item.append(caption, amount); return item;
    }));
    $('#careTimerTitle').textContent = '빠른 기록';
    $('#growthTitle').textContent = '최근 기록';
  };
  const previousRender = renderGrowth;
  const render = function(...args) { const result = previousRender.apply(this, args); renderSummary(); return result; };
  Object.assign(render, previousRender); renderGrowth = render;
  renderSummary();
  for (const event of ['familycontextchange', 'familybabychange']) window.addEventListener(event, renderSummary);
})();
