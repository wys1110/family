/* Approved C design. Presentation delegates every action to the existing app. */
(() => {
  const install = () => {
    const root = document.documentElement;
    const $ = selector => document.querySelector(selector);
    const shell = $('#appShell'), originalNav = $('.view-tabs');
    if (!shell || !originalNav || $('#simpleNavigation')) return;
    root.dataset.simpleFamily = 'true';
    const labels = {calendar: '오늘', growth: '성장', assistant: '육아', english: '동화', travel: '여행', settings: '설정', admin: '관리'};
    const mainViews = ['calendar', 'growth', 'assistant', 'english'];
    const icons = {calendar: 'calendar', growth: 'growth', assistant: 'chat', english: 'book', travel: 'map', settings: 'settings', admin: 'crown'};
    const text = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
    const icon = name => { const span = document.createElement('span'); span.className = 'simple-icon'; span.dataset.icon = name; span.setAttribute('aria-hidden', 'true'); return span; };
    const button = (label, name) => { const node = document.createElement('button'); node.type = 'button'; if (name) node.append(icon(name)); const caption = document.createElement('span'); caption.textContent = label; node.append(caption); return node; };
    const originalTab = view => originalNav.querySelector(`[data-view="${view}"]`);
    const navigate = view => {
      const target = originalTab(view);
      if (!target || target.hidden || target.disabled) return;
      target.click();
      if (view === 'calendar') $('#calendarView [data-calendar-mode="calendar"][aria-selected="false"]')?.click();
    };

    const dock = document.createElement('div'); dock.className = 'simple-bottom';
    const quick = document.createElement('div'); quick.className = 'simple-quick'; quick.setAttribute('aria-label', '빠른 돌봄 기록');
    const sources = {sleep: '#careTimerCard [data-compact-sleep]', feed: '#careTimerCard [data-growth-quick="수유·이유식"]', diaper: '#careTimerCard [data-growth-quick="기저귀"]'};
    const quickButtons = {};
    for (const [kind, label] of [['sleep','수면 시작'], ['feed','수유'], ['diaper','기저귀']]) {
      const control = button(label, kind); control.dataset.quick = kind;
      control.addEventListener('click', () => { const source = $(sources[kind]); if (source && !source.disabled) source.click(); });
      quickButtons[kind] = control; quick.append(control);
    }
    const navigation = document.createElement('nav'); navigation.id = 'simpleNavigation'; navigation.setAttribute('aria-label', '가족 앱 메뉴');
    for (const view of mainViews) { const tab = button(labels[view], icons[view]); tab.dataset.simpleView = view; tab.addEventListener('click', () => navigate(view)); navigation.append(tab); }
    const more = button('더보기', 'more'); more.setAttribute('aria-haspopup', 'dialog'); more.setAttribute('aria-controls', 'simpleMore'); navigation.append(more);
    dock.append(quick, navigation); shell.append(dock);
    // Keep original nodes and listeners for deferred loading, permissions and route restoration.

    const moreDialog = document.createElement('dialog'); moreDialog.id = 'simpleMore'; moreDialog.className = 'simple-more'; moreDialog.setAttribute('aria-labelledby', 'simpleMoreTitle');
    const moreHeader = document.createElement('header'), moreTitle = document.createElement('h2'), close = button('닫기');
    moreTitle.id = 'simpleMoreTitle'; moreTitle.textContent = '더보기'; close.addEventListener('click', () => moreDialog.close()); moreHeader.append(moreTitle, close);
    const moreItems = document.createElement('div'); moreItems.className = 'simple-more-items'; moreDialog.append(moreHeader, moreItems); shell.append(moreDialog);
    const renderMore = () => {
      moreItems.replaceChildren();
      const addEvent = button('일정 추가', 'calendar');
      addEvent.addEventListener('click', () => { moreDialog.close(); navigate('calendar'); $('#addEventButton')?.click(); });
      moreItems.append(addEvent);
      originalNav.querySelectorAll('.view-tab[data-view]').forEach(tab => {
        const view = tab.dataset.view;
        if (mainViews.includes(view) || tab.hidden || tab.disabled) return;
        const item = button(labels[view] || tab.textContent.trim(), icons[view] || 'settings');
        item.addEventListener('click', () => { moreDialog.close(); navigate(view); }); moreItems.append(item);
      });
      const wallpaper = button('오늘 화면 배경 사진', 'calendar'); wallpaper.addEventListener('click', () => { moreDialog.close(); navigate('calendar'); $('#calendarView [data-wallpaper-change]')?.click(); }); moreItems.append(wallpaper);
      const account = button('계정 및 저장 상태', 'settings'); account.addEventListener('click', () => { moreDialog.close(); $('#accountButton')?.click(); }); moreItems.append(account);
    };
    more.addEventListener('click', () => { renderMore(); moreDialog.showModal(); });
    moreDialog.addEventListener('close', () => more.setAttribute('aria-expanded', 'false'));
    moreDialog.addEventListener('click', event => { if (event.target === moreDialog) moreDialog.close(); });
    more.addEventListener('click', () => more.setAttribute('aria-expanded', 'true'));

    const heading = $('.topbar h1'); heading.replaceChildren();
    const subtitle = document.createElement('span'); subtitle.textContent = '우리 가족';
    const title = document.createElement('strong'); heading.append(subtitle, title);
    // Verse stays live but no longer pushes every page's content below the fold.
    $('#calendarView').append($('.daily-verse-card'));
    const journal = $('#babyJournalContent'), history = $('#growthView .growth-section'), summary = $('.compact-today');
    const pattern = $('.care-pattern-section');
    if (summary && pattern) summary.after(pattern);
    if (history && (pattern || summary)) (pattern || summary).after(history);
    const analysis = document.createElement('details'); analysis.className = 'simple-analysis';
    const analysisTitle = document.createElement('summary'); analysisTitle.textContent = '돌봄 분석과 성장 그래프'; analysis.append(analysisTitle);
    for (const selector of ['.integrated-care-summary', '#growthInsightRow']) { const node = $(selector); if (node) analysis.append(node); }
    if (history) history.before(analysis); else journal?.append(analysis);
    const profileTools = document.createElement('details'); profileTools.className = 'simple-profile-tools';
    const profileCaption = document.createElement('summary'); profileCaption.textContent = '아이 관리'; profileTools.append(profileCaption);
    for (const selector of ['#growthView .baby-header-actions']) { const node = $(selector); if (node) profileTools.append(node); }
    $('#growthView').append(profileTools);
    const filters = $('#growthRecordFilters');
    if (filters) { const details = document.createElement('details'); details.className = 'simple-record-filters'; const caption = document.createElement('summary'); caption.textContent = '종류·기간으로 찾기'; details.append(caption); filters.before(details); details.append(filters); }
    const quickBlock = $('#careTimerCard .care-quick-block');
    if (quickBlock) { const details = document.createElement('details'); details.className = 'simple-record-tools'; const caption = document.createElement('summary'); caption.textContent = '직수·건강·성장 등 모든 기록'; details.append(caption); quickBlock.before(details); details.append(quickBlock); }

    const status = button('돌봄 기록 보기', 'sleep'); status.className = 'simple-care-status'; status.addEventListener('click', () => navigate('growth'));
    const statusText = status.lastElementChild; $('#calendarView').prepend(status);
    const syncCare = () => {
      const running = $('#careTimerRunning');
      const hasBaby = Boolean(window.FAMILY_APP_STATE?.babies?.some(baby => baby.id === window.FAMILY_APP_STATE.activeBabyId));
      for (const [kind, control] of Object.entries(quickButtons)) {
        const source = $(sources[kind]); control.disabled = !hasBaby || !source || source.disabled;
      }
      const sleepSource = $(sources.sleep);
      text(quickButtons.sleep.lastElementChild, sleepSource?.textContent.includes('수면 끝') ? '수면 끝' : '수면 시작');
      status.hidden = !hasBaby;
      const runningText = running && !running.hidden ? [$('#careTimerBaby')?.textContent, $('#careTimerLabel')?.textContent, $('#careTimerClock')?.textContent].filter(Boolean).join(' · ') : '수면·수유·기저귀를 아래에서 바로 기록하세요';
      text(statusText, runningText);
      quick.hidden = !hasBaby || !['calendar','growth'].includes(window.FAMILY_APP_STATE?.activeView);
      root.dataset.simpleQuick = String(!quick.hidden);
    };
    const syncNavigation = () => {
      const active = originalNav.querySelector('.view-tab.active')?.dataset.view || window.FAMILY_APP_STATE?.activeView || 'calendar';
      text(title, labels[active] || '우리 가족');
      text(subtitle, active === 'calendar' ? new Date().toLocaleDateString('ko-KR', {month:'long',day:'numeric',weekday:'long'}) : '우리 가족');
      navigation.querySelectorAll('[data-simple-view]').forEach(tab => {
        const selected = tab.dataset.simpleView === active;
        if (selected) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
      });
      if (mainViews.includes(active)) more.removeAttribute('aria-current'); else more.setAttribute('aria-current', 'page');
      if (moreDialog.open) renderMore();
      syncCare();
    };
    new MutationObserver(syncNavigation).observe(originalNav, {subtree:true, childList:true, attributes:true, attributeFilter:['class','hidden','disabled']});
    const timer = $('#careTimerCard');
    if (timer) new MutationObserver(syncCare).observe(timer, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['hidden','disabled']});
    for (const event of ['familycontextchange','familybabychange']) window.addEventListener(event, () => { if (moreDialog.open) moreDialog.close(); syncNavigation(); });
    const descriptions = {white:'라벤더 바탕과 따뜻한 피치 포인트', black:'차분한 어둠과 부드러운 라벤더·피치'};
    document.querySelectorAll('[data-theme-option]').forEach(option => text(option.querySelector('.theme-option-copy small'), descriptions[option.dataset.themeOption]));
    syncNavigation();
    originalNav.hidden = true;
  };
  if (window.FAMILY_MODULES_READY) window.FAMILY_MODULES_READY.then(install);
  else install();
})();
