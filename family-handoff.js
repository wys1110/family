(() => {
  const dateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const currentState = () => (typeof state === 'undefined' ? null : state);
  const activeBabyEntries = () => {
    const current = currentState();
    return (current?.growthEntries || [])
      .filter((entry) => !current?.activeBabyId || entry.babyId === current.activeBabyId)
      .sort((left, right) => `${right.date}T${right.time || '00:00'}T${right.createdAt || ''}`.localeCompare(`${left.date}T${left.time || '00:00'}T${left.createdAt || ''}`, 'ko-KR'));
  };

  const getSnapshot = () => {
    const current = currentState();
    const today = dateKey();
    const todos = window.FAMILY_TODO_API?.getFamilySnapshot?.() || [];
    const priorityTodo = todos.find(todo => !todo.completed && todo.dueDate && todo.dueDate <= today) || null;
    const nextEvent = (current?.events || [])
      .filter((event) => String(event.endDate || event.date || '') >= today)
      .sort((left, right) => `${left.date}T${left.time || '99:99'}`.localeCompare(`${right.date}T${right.time || '99:99'}`, 'ko-KR'))[0] || null;

    return { latestCare: activeBabyEntries()[0] || null, priorityTodo, nextEvent };
  };

  const formatTime = (value) => value ? `${value} · ` : '';
  let card = null;

  const openGrowth = (entry = null) => {
    document.querySelector('[data-view="growth"]')?.click();
    if (entry && typeof openGrowthDialog === 'function') openGrowthDialog(entry);
  };

  const render = () => {
    if (!card) return;
    const snapshot = getSnapshot();
    const summary = card.querySelector('[data-family-handoff-summary]');
    const detail = card.querySelector('[data-family-handoff-detail]');
    const action = card.querySelector('[data-family-handoff-action]');

    if (snapshot.priorityTodo) {
      summary.textContent = snapshot.priorityTodo.title;
      detail.textContent = `${snapshot.priorityTodo.dueDate} · ${snapshot.priorityTodo.assignee || '가족'} · 아직 완료되지 않았어요`;
      action.textContent = '할 일 완료';
      action.dataset.familyHandoffAction = 'todo';
      return;
    }
    if (snapshot.latestCare) {
      summary.textContent = snapshot.latestCare.title || snapshot.latestCare.category || '최근 돌봄 기록';
      detail.textContent = `${snapshot.latestCare.category || '돌봄'} · ${formatTime(snapshot.latestCare.time)}마지막 기록`;
      action.textContent = '최근 기록 보기';
      action.dataset.familyHandoffAction = 'growth';
      return;
    }
    if (snapshot.nextEvent) {
      summary.textContent = snapshot.nextEvent.title || '다가오는 일정';
      detail.textContent = `${snapshot.nextEvent.date} · ${formatTime(snapshot.nextEvent.time)}${snapshot.nextEvent.member || '가족 일정'}`;
      action.textContent = '일정 탭 열기';
      action.dataset.familyHandoffAction = 'calendar';
      return;
    }
    summary.textContent = '오늘 첫 기록을 남겨보세요';
    detail.textContent = '가족이 함께 보면 다음 돌봄을 이어가기 쉬워져요.';
    action.textContent = '성장 기록하기';
    action.dataset.familyHandoffAction = 'start-growth';
  };

  const mount = (attempt = 0) => {
    if (card || attempt > 40) return;
    const hero = document.querySelector('#calendarView .hero-card');
    if (!hero) return setTimeout(() => mount(attempt + 1), 50);

    card = document.createElement('section');
    card.className = 'family-handoff-card';
    card.dataset.familyHandoffModule = '';
    card.setAttribute('aria-labelledby', 'familyHandoffTitle');
    card.innerHTML = `
      <div class="family-handoff-heading"><div><p class="eyebrow">FAMILY HANDOFF</p><h2 id="familyHandoffTitle">지금 이어서 할 일</h2></div><button type="button" data-family-handoff-action></button></div>
      <strong data-family-handoff-summary></strong>
      <small data-family-handoff-detail></small>`;
    const onboarding = document.querySelector('[data-family-onboarding-module]');
    if (onboarding) onboarding.insertAdjacentElement('afterend', card);
    else hero.insertAdjacentElement('afterend', card);
    card.addEventListener('click', (event) => {
      const action = event.target.closest('[data-family-handoff-action]')?.dataset.familyHandoffAction;
      if (!action) return;
      const snapshot = getSnapshot();
      if (action === 'todo' && snapshot.priorityTodo) return window.FAMILY_TODO_API?.toggle?.(snapshot.priorityTodo.id);
      if (action === 'growth' && snapshot.latestCare) return openGrowth(snapshot.latestCare);
      if (action === 'calendar') return document.querySelector('[data-view="calendar"]')?.click();
      openGrowth();
    });
    render();
  };

  ['familycontextchange', 'family:growth-entry-saved', 'family:todo-snapshot-changed'].forEach((eventName) => {
    window.addEventListener(eventName, render);
  });

  window.FAMILY_HANDOFF_API = { getSnapshot };
  mount();
})();
