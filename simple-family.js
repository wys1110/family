/* Approved C design. Presentation delegates every action to the existing app. */
(() => {
  const install = () => {
    const root = document.documentElement;
    const $ = selector => document.querySelector(selector);
    const shell = $('#appShell'), originalNav = $('.view-tabs');
    if (!shell || !originalNav || $('#simpleNavigation')) return;
    root.dataset.simpleFamily = 'true';
    const labels = {calendar: '오늘', growth: '성장', assistant: '육아', english: '동화', travel: '여행 기록', settings: '설정', admin: '관리'};
    const mainViews = ['calendar', 'growth', 'english', 'settings', 'admin'];
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

    const notifications = $('#notificationCenterButton');
    const search = $('#familySearchButton');
    if (notifications && search) {
      const tools = document.createElement('div');
      tools.className = 'simple-header-tools';
      tools.setAttribute('role', 'group');
      tools.setAttribute('aria-label', '알림 및 검색');
      notifications.before(tools);
      tools.append(notifications, search);
    }

    const dock = document.createElement('div'); dock.className = 'simple-bottom';
    const quick = document.createElement('div'); quick.className = 'simple-quick'; quick.setAttribute('aria-label', '빠른 돌봄');
    const sources = {sleep: '#careTimerCard [data-compact-sleep]', feed: '#careTimerCard [data-growth-quick="수유·이유식"]', diaper: '#careTimerCard [data-growth-quick="기저귀"]'};
    const quickButtons = {};
    for (const [kind, label] of [['sleep','수면 시작'], ['feed','수유'], ['diaper','기저귀']]) {
      const control = button(label, kind); control.dataset.quick = kind;
      control.addEventListener('click', () => { const source = $(sources[kind]); if (source && !source.disabled) source.click(); });
      quickButtons[kind] = control; quick.append(control);
    }
    const lullaby = button('자장가', 'music');
    lullaby.dataset.quick = 'lullaby';
    lullaby.setAttribute('aria-haspopup', 'dialog');
    lullaby.setAttribute('aria-controls', 'quickLullabyDialog');
    lullaby.setAttribute('aria-expanded', 'false');
    const player = window.FAMILY_LULLABY;
    const chooser = document.createElement('dialog');
    chooser.id = 'quickLullabyDialog';
    const chooserHeader = document.createElement('header');
    const chooserTitle = document.createElement('h2');
    chooserTitle.id = 'quickLullabyTitle';
    chooserTitle.textContent = '자장가 선택';
    chooser.setAttribute('aria-labelledby', chooserTitle.id);
    const dismiss = button('닫기');
    dismiss.addEventListener('click', () => chooser.close());
    chooserHeader.append(chooserTitle, dismiss);

    const trackList = document.createElement('div');
    trackList.className = 'quick-lullaby-tracks';
    for (const track of player?.tracks || []) {
      const item = button(track.label);
      item.dataset.lullabyTrack = track.id;
      item.addEventListener('click', () => {
        player.select(track.id, { playNow: true });
        chooser.close();
      });
      trackList.append(item);
    }
    const stopLullaby = button('정지');
    stopLullaby.dataset.lullabyStop = '';
    stopLullaby.addEventListener('click', () => { player.stop(); chooser.close(); });
    chooser.append(chooserHeader, trackList, stopLullaby);
    shell.append(chooser);

    const syncLullaby = (playing, id, label) => {
      lullaby.dataset.playing = String(playing);
      lullaby.setAttribute('aria-label', playing ? `자장가 선택, ${label} 재생 중` : '자장가 선택');
      stopLullaby.hidden = !playing;
      for (const item of trackList.children) {
        const current = item.dataset.lullabyTrack === id;
        item.setAttribute('aria-current', String(current));
        item.dataset.playing = String(current && playing);
      }
    };
    syncLullaby(false, player?.selected, '');
    window.addEventListener('family:lullaby-playback', ({ detail }) => syncLullaby(detail.playing, detail.id, detail.label));
    lullaby.addEventListener('click', () => {
      chooser.showModal();
      lullaby.setAttribute('aria-expanded', 'true');
      trackList.querySelector('[aria-current="true"]')?.focus();
    });
    chooser.addEventListener('close', () => {
      lullaby.setAttribute('aria-expanded', 'false');
      lullaby.focus();
    });
    quick.append(lullaby);
    const navigation = document.createElement('nav'); navigation.id = 'simpleNavigation'; navigation.setAttribute('aria-label', '가족 앱 메뉴');
    for (const view of mainViews) {
      const tab = button(labels[view], icons[view]);
      tab.dataset.simpleView = view;
      tab.hidden = view === 'admin';
      tab.addEventListener('click', () => navigate(view));
      navigation.append(tab);
    }
    dock.append(quick, navigation); shell.append(dock);

    // Original tabs own lazy loading, restoration and permission checks.
    const travelLink = button(labels.travel, icons.travel);
    travelLink.dataset.settingsView = 'travel';
    travelLink.addEventListener('click', () => navigate('travel'));
    $('#simpleSettingsLinks')?.append(travelLink);

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
        const original = originalTab(tab.dataset.simpleView);
        tab.disabled = !original || original.hidden || original.disabled;
        tab.hidden = tab.dataset.simpleView === 'admin' && tab.disabled;
        const selected = !tab.hidden && tab.dataset.simpleView === active;
        if (selected) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
      });
      const travelTab = originalTab('travel');
      travelLink.hidden = !travelTab || travelTab.hidden || travelTab.disabled;
      syncCare();
    };
    new MutationObserver(syncNavigation).observe(originalNav, {subtree:true, childList:true, attributes:true, attributeFilter:['class','hidden','disabled']});
    const timer = $('#careTimerCard');
    if (timer) new MutationObserver(syncCare).observe(timer, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['hidden','disabled']});
    for (const event of ['familycontextchange','familybabychange']) window.addEventListener(event, syncNavigation);
    const descriptions = {white:'라벤더 바탕과 따뜻한 피치 포인트', black:'차분한 어둠과 부드러운 라벤더·피치'};
    document.querySelectorAll('[data-theme-option]').forEach(option => text(option.querySelector('.theme-option-copy small'), descriptions[option.dataset.themeOption]));
    syncNavigation();
    originalNav.hidden = true;
  };
  if (window.FAMILY_MODULES_READY) window.FAMILY_MODULES_READY.then(install);
  else install();
})();
