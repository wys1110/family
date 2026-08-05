(() => {
  if (document.querySelector('[data-today-overview-module]')) return;

  const calendarView = document.querySelector('#calendarView');
  const hero = calendarView?.querySelector('.hero-card');
  if (!calendarView || !hero) return;

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
  const dateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const formatDuration = (minutes) => {
    const value = Number(minutes) || 0;
    if (!value) return '0분';
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return [hours ? `${hours}시간` : '', rest ? `${rest}분` : ''].filter(Boolean).join(' ');
  };
  const currentTodos = () => window.FAMILY_TODO_API?.getSnapshot?.() || [];
  const unreadNotifications = () => window.FAMILY_NOTIFICATION_API?.getUnreadCount?.() || 0;
  const utility = () => window.FAMILY_UTILITY_API;
  const stateRows = () => ({
    events: typeof state !== 'undefined' && Array.isArray(state.events) ? state.events : [],
    growthEntries: typeof state !== 'undefined' && Array.isArray(state.growthEntries) ? state.growthEntries : [],
  });

  const card = document.createElement('section');
  card.id = 'todayOverviewCard';
  card.className = 'today-overview-card';
  card.dataset.todayOverviewModule = '';
  card.setAttribute('aria-labelledby', 'todayOverviewTitle');
  card.innerHTML = `
    <div class="today-overview-heading">
      <div><p class="eyebrow">TODAY AT A GLANCE</p><h2 id="todayOverviewTitle">오늘 한눈에 보기</h2></div>
      <span class="today-overview-date" data-today-overview-date></span>
    </div>
    <div class="today-overview-grid">
      <button type="button" class="today-overview-item" data-today-overview-target="calendar">
        <span class="today-overview-icon calendar" aria-hidden="true">일</span>
        <span><strong data-today-overview-events>0개 일정</strong><small data-today-overview-next>다음 일정이 없어요</small></span>
      </button>
      <button type="button" class="today-overview-item" data-today-overview-target="growth">
        <span class="today-overview-icon growth" aria-hidden="true">돌</span>
        <span><strong data-today-overview-care>돌봄 기록 없음</strong><small data-today-overview-care-detail>오늘 기록을 남겨보세요</small></span>
      </button>
      <button type="button" class="today-overview-item" data-today-overview-target="todo">
        <span class="today-overview-icon todo" aria-hidden="true">할</span>
        <span><strong data-today-overview-todos>0개 할 일</strong><small>오늘 미완료 기준</small></span>
      </button>
      <button type="button" class="today-overview-item" data-today-overview-target="notifications">
        <span class="today-overview-icon notification" aria-hidden="true">알</span>
        <span><strong data-today-overview-notifications>새 알림 없음</strong><small>가족 변경·예정 알림</small></span>
      </button>
    </div>`;
  hero.insertAdjacentElement('afterend', card);

  const render = () => {
    const today = dateKey();
    const rows = stateRows();
    const summary = utility()?.todaySummary?.({
      ...rows,
      todos: currentTodos(),
      unreadNotifications: unreadNotifications(),
      todayKey: today,
    }) || {
      eventCount: 0, nextEvent: null, todoCount: 0, feedingMl: 0, feedingMinutes: 0,
      sleepMinutes: 0, diaperCount: 0, unreadNotifications: 0,
    };
    card.querySelector('[data-today-overview-date]').textContent = today.replaceAll('-', '.');
    card.querySelector('[data-today-overview-events]').textContent = `${summary.eventCount}개 일정`;
    card.querySelector('[data-today-overview-next]').textContent = summary.nextEvent
      ? `${summary.nextEvent.time ? `${summary.nextEvent.time} · ` : ''}${escapeHtml(summary.nextEvent.title)}`
      : '다음 일정이 없어요';
    const careValues = [
      summary.feedingMl ? `수유 ${summary.feedingMl}ml` : '',
      summary.feedingMinutes ? `직수 ${summary.feedingMinutes}분` : '',
      summary.sleepMinutes ? `수면 ${formatDuration(summary.sleepMinutes)}` : '',
      summary.diaperCount ? `기저귀 ${summary.diaperCount}회` : '',
    ].filter(Boolean);
    card.querySelector('[data-today-overview-care]').textContent = careValues.length ? careValues[0] : '돌봄 기록 없음';
    card.querySelector('[data-today-overview-care-detail]').textContent = careValues.length > 1
      ? careValues.slice(1).join(' · ')
      : careValues.length ? '오늘 기록 요약' : '성장 탭에서 기록해 보세요';
    card.querySelector('[data-today-overview-todos]').textContent = `${summary.todoCount}개 할 일`;
    card.querySelector('[data-today-overview-notifications]').textContent = summary.unreadNotifications
      ? `새 알림 ${summary.unreadNotifications}개`
      : '새 알림 없음';
  };

  const openTarget = (target) => {
    if (target === 'notifications') return document.querySelector('#notificationCenterButton')?.click();
    if (target === 'todo') {
      document.querySelector('[data-view="calendar"]')?.click();
      setTimeout(() => document.querySelector('[data-calendar-mode="todo"]')?.click(), 0);
      return;
    }
    document.querySelector(`[data-view="${target}"]`)?.click();
  };

  card.addEventListener('click', (event) => {
    const target = event.target.closest('[data-today-overview-target]')?.dataset.todayOverviewTarget;
    if (target) openTarget(target);
  });
  ['familycontextchange', 'family:growth-entry-saved', 'family:todo-snapshot-changed', 'family:notification-count-changed'].forEach((eventName) => {
    window.addEventListener(eventName, render);
  });
  render();
})();
