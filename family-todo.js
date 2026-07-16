(() => {
  if (document.querySelector('[data-family-todo-module]')) return;

  const MODE_KEY = 'family-calendar-mode-v1';
  const FILTER_KEY = 'family-todo-filter-v1';
  const LOCAL_KEY = 'family-todos-v1';
  const VALID_FILTERS = new Set(['today', 'upcoming', 'completed']);
  const VALID_RECURRENCES = new Set(['none', 'daily', 'weekly', 'monthly']);
  const DEFAULT_MEMBERS = ['가족', '아빠', '엄마', '도윤'];

  const calendarView = document.querySelector('#calendarView');
  const appShell = document.querySelector('#appShell');
  const calendarGrid = document.querySelector('#calendarGrid');
  if (!calendarView || !appShell) return;

  const moduleState = {
    mode: readMode(),
    filter: readFilter(),
    todos: [],
    loaded: false,
    loading: false,
    storage: 'local',
    busyIds: new Set(),
  };

  const originalCalendarChildren = [...calendarView.children];
  const calendarPanel = document.createElement('div');
  calendarPanel.className = 'family-calendar-panel';
  originalCalendarChildren.forEach((child) => calendarPanel.appendChild(child));

  const subnav = document.createElement('div');
  subnav.className = 'calendar-subtabs';
  subnav.dataset.familyTodoModule = '';
  subnav.setAttribute('role', 'tablist');
  subnav.setAttribute('aria-label', '캘린더와 할 일 전환');
  subnav.innerHTML = `
    <button type="button" data-calendar-mode="calendar" role="tab"><span aria-hidden="true">📅</span> 캘린더</button>
    <button type="button" data-calendar-mode="todo" role="tab"><span aria-hidden="true">✅</span> 할 일</button>
  `;

  const todoView = document.createElement('section');
  todoView.id = 'familyTodoView';
  todoView.className = 'family-todo-view';
  todoView.hidden = true;
  todoView.innerHTML = `
    <section class="todo-overview-card" aria-labelledby="familyTodoTitle">
      <div class="todo-overview-heading">
        <div>
          <p class="eyebrow">FAMILY TO-DO</p>
          <h2 id="familyTodoTitle">가족 할 일</h2>
          <span>함께 해야 할 일을 한곳에서 챙겨요.</span>
        </div>
        <button class="todo-refresh-button" id="familyTodoRefresh" type="button" aria-label="할 일 새로고침">↻</button>
      </div>
      <div class="todo-stats" aria-live="polite">
        <div><strong id="todoTodayCount">0</strong><span>오늘</span></div>
        <div><strong id="todoUpcomingCount">0</strong><span>예정</span></div>
        <div><strong id="todoCompletedCount">0</strong><span>완료</span></div>
      </div>
      <p class="todo-storage-note" id="todoStorageNote"></p>
    </section>

    <form class="todo-quick-form" id="todoQuickForm">
      <label for="todoQuickTitle">빠른 추가</label>
      <div>
        <input id="todoQuickTitle" maxlength="80" autocomplete="off" placeholder="예: 분유 주문하기" required />
        <button type="submit"><span aria-hidden="true">＋</span> 추가</button>
      </div>
      <small>빠른 추가는 오늘 할 일 · 담당 가족으로 저장돼요.</small>
    </form>

    <div class="todo-filter-tabs" role="tablist" aria-label="할 일 필터">
      <button type="button" data-todo-filter="today" role="tab">오늘</button>
      <button type="button" data-todo-filter="upcoming" role="tab">예정</button>
      <button type="button" data-todo-filter="completed" role="tab">완료</button>
    </div>

    <div class="family-todo-list" id="familyTodoList" aria-live="polite"></div>
  `;

  calendarView.append(subnav, calendarPanel, todoView);

  const todoFab = document.createElement('button');
  todoFab.className = 'fab family-todo-fab';
  todoFab.id = 'addFamilyTodoButton';
  todoFab.type = 'button';
  todoFab.hidden = true;
  todoFab.setAttribute('aria-label', '새 할 일 추가');
  todoFab.innerHTML = '<span>＋</span> 할 일 추가';
  appShell.appendChild(todoFab);

  const dialog = document.createElement('dialog');
  dialog.id = 'familyTodoDialog';
  dialog.className = 'sheet-dialog family-todo-dialog';
  dialog.innerHTML = `
    <form id="familyTodoForm" method="dialog">
      <div class="sheet-handle"></div>
      <div class="dialog-header">
        <div><p class="eyebrow">FAMILY TO-DO</p><h2 id="familyTodoDialogTitle">새 할 일</h2></div>
        <button type="button" class="close-button" data-todo-close aria-label="닫기">×</button>
      </div>
      <input type="hidden" id="familyTodoId" />
      <label class="title-field">할 일<input id="familyTodoTitleInput" maxlength="80" autocomplete="off" placeholder="예: 장보기" required /></label>
      <div class="form-row todo-form-row">
        <label>담당자<select id="familyTodoAssignee"></select></label>
        <label>마감일<input id="familyTodoDueDate" type="date" /></label>
      </div>
      <label>반복<select id="familyTodoRecurrence">
        <option value="none">반복 안 함</option>
        <option value="daily">매일</option>
        <option value="weekly">매주</option>
        <option value="monthly">매월</option>
      </select></label>
      <label>메모<textarea id="familyTodoNote" maxlength="500" rows="4" placeholder="준비물이나 상세 내용을 적어두세요"></textarea></label>
      <p class="todo-dialog-help" id="familyTodoDialogHelp">가족 구성원 모두가 확인하고 완료할 수 있어요.</p>
      <div class="dialog-actions">
        <button type="button" class="danger-button" id="deleteFamilyTodoButton">삭제</button>
        <button type="submit" class="primary-button" id="saveFamilyTodoButton">할 일 추가</button>
      </div>
    </form>
  `;
  document.body.appendChild(dialog);

  const list = todoView.querySelector('#familyTodoList');
  const quickForm = todoView.querySelector('#todoQuickForm');
  const quickTitle = todoView.querySelector('#todoQuickTitle');
  const refreshButton = todoView.querySelector('#familyTodoRefresh');
  const form = dialog.querySelector('#familyTodoForm');
  const dialogTitle = dialog.querySelector('#familyTodoDialogTitle');
  const todoIdInput = dialog.querySelector('#familyTodoId');
  const titleInput = dialog.querySelector('#familyTodoTitleInput');
  const assigneeInput = dialog.querySelector('#familyTodoAssignee');
  const dueDateInput = dialog.querySelector('#familyTodoDueDate');
  const recurrenceInput = dialog.querySelector('#familyTodoRecurrence');
  const noteInput = dialog.querySelector('#familyTodoNote');
  const dialogHelp = dialog.querySelector('#familyTodoDialogHelp');
  const deleteButton = dialog.querySelector('#deleteFamilyTodoButton');
  const saveButton = dialog.querySelector('#saveFamilyTodoButton');
  const storageNote = todoView.querySelector('#todoStorageNote');

  function readMode() {
    try { return localStorage.getItem(MODE_KEY) === 'todo' ? 'todo' : 'calendar'; }
    catch { return 'calendar'; }
  }

  function readFilter() {
    try {
      const value = localStorage.getItem(FILTER_KEY);
      return VALID_FILTERS.has(value) ? value : 'today';
    } catch { return 'today'; }
  }

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeText(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[character]);
  }

  function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDate(value) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function addRecurrence(value, recurrence) {
    const source = parseDate(value);
    if (!source) return null;
    if (recurrence === 'daily') source.setDate(source.getDate() + 1);
    if (recurrence === 'weekly') source.setDate(source.getDate() + 7);
    if (recurrence === 'monthly') {
      const day = source.getDate();
      const targetYear = source.getMonth() === 11 ? source.getFullYear() + 1 : source.getFullYear();
      const targetMonth = (source.getMonth() + 1) % 12;
      const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
      source.setFullYear(targetYear, targetMonth, Math.min(day, lastDay));
    }
    return dateKey(source);
  }

  function currentMembers() {
    if (typeof state !== 'undefined' && Array.isArray(state.familyMembers) && state.familyMembers.length) {
      return state.familyMembers.map((member) => member.name).filter(Boolean);
    }
    return [...DEFAULT_MEMBERS];
  }

  function familyContext() {
    if (typeof state === 'undefined') return null;
    if (!state.supabase || !state.session || !state.household?.id) return null;
    return { supabase: state.supabase, session: state.session, household: state.household };
  }

  async function waitForFamilyContext() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const context = familyContext();
      if (context) return context;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }

  function normalizeTodo(todo = {}) {
    return {
      id: todo.id || uid(),
      title: String(todo.title || '').slice(0, 80),
      dueDate: todo.dueDate ?? todo.due_date ?? null,
      assignee: String(todo.assignee || '가족').slice(0, 20),
      note: String(todo.note || '').slice(0, 500),
      recurrence: VALID_RECURRENCES.has(todo.recurrence) ? todo.recurrence : 'none',
      completed: Boolean(todo.completed),
      completedAt: todo.completedAt ?? todo.completed_at ?? null,
      parentId: todo.parentId ?? todo.recurrence_parent_id ?? null,
      createdAt: todo.createdAt ?? todo.created_at ?? new Date().toISOString(),
      updatedAt: todo.updatedAt ?? todo.updated_at ?? new Date().toISOString(),
    };
  }

  function readLocalTodos() {
    try {
      const data = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      return Array.isArray(data) ? data.map(normalizeTodo) : [];
    } catch { return []; }
  }

  function writeLocalTodos(todos = moduleState.todos) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(todos)); }
    catch { announce('브라우저 저장 공간을 사용할 수 없어요.'); }
  }

  function toRemote(todo, context) {
    return {
      id: todo.id,
      household_id: context.household.id,
      title: todo.title,
      due_date: todo.dueDate || null,
      assignee: todo.assignee || '가족',
      note: todo.note || null,
      recurrence: todo.recurrence || 'none',
      completed: Boolean(todo.completed),
      completed_at: todo.completedAt || null,
      recurrence_parent_id: todo.parentId || null,
      created_by: context.session.user.id,
      created_at: todo.createdAt || new Date().toISOString(),
      updated_at: todo.updatedAt || new Date().toISOString(),
    };
  }

  function isMissingTable(error) {
    return error?.code === '42P01' || error?.code === 'PGRST205' || /family_todos/i.test(error?.message || '');
  }

  function announce(message) {
    if (typeof toast === 'function') toast(message);
    else {
      storageNote.textContent = message;
      storageNote.classList.add('message');
      clearTimeout(announce.timer);
      announce.timer = setTimeout(() => storageNote.classList.remove('message'), 2600);
    }
  }

  function updateStorageNote() {
    if (moduleState.loading) {
      storageNote.textContent = '가족 할 일을 불러오는 중이에요…';
      storageNote.dataset.storage = 'loading';
      return;
    }
    if (moduleState.storage === 'remote') {
      storageNote.textContent = '가족 DB와 동기화 중 · 가족 모두에게 보여요';
      storageNote.dataset.storage = 'remote';
    } else if (familyContext()) {
      storageNote.textContent = 'DB 적용 전 · 현재 기기에 임시 저장 중';
      storageNote.dataset.storage = 'local';
    } else {
      storageNote.textContent = '로그인하면 가족과 함께 공유할 수 있어요';
      storageNote.dataset.storage = 'local';
    }
  }

  async function loadTodos({ silent = false } = {}) {
    if (moduleState.loading) return;
    moduleState.loading = true;
    if (!silent) renderTodos();
    updateStorageNote();

    const context = await waitForFamilyContext();
    if (!context) {
      moduleState.storage = 'local';
      moduleState.todos = readLocalTodos();
      moduleState.loaded = true;
      moduleState.loading = false;
      renderTodos();
      decorateCalendar();
      return;
    }

    const { data, error } = await context.supabase
      .from('family_todos')
      .select('id, title, due_date, assignee, note, recurrence, completed, completed_at, recurrence_parent_id, created_at, updated_at')
      .eq('household_id', context.household.id)
      .order('completed', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      moduleState.storage = 'local';
      moduleState.todos = readLocalTodos();
      moduleState.loaded = true;
      moduleState.loading = false;
      renderTodos();
      decorateCalendar();
      if (!silent && !isMissingTable(error)) announce('할 일을 불러오지 못해 기기 저장으로 전환했어요.');
      return;
    }

    let remoteData = data || [];
    const localTodos = readLocalTodos();
    if (localTodos.length) {
      const { error: migrateError } = await context.supabase
        .from('family_todos')
        .upsert(localTodos.map((todo) => toRemote(todo, context)), { onConflict: 'id' });
      if (!migrateError) {
        try { localStorage.removeItem(LOCAL_KEY); } catch { /* 원격 저장은 완료됨 */ }
        const { data: refreshedData, error: refreshedError } = await context.supabase
          .from('family_todos')
          .select('id, title, due_date, assignee, note, recurrence, completed, completed_at, recurrence_parent_id, created_at, updated_at')
          .eq('household_id', context.household.id)
          .order('completed', { ascending: true })
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(500);
        if (!refreshedError) remoteData = refreshedData || [];
      }
    }

    moduleState.storage = 'remote';
    moduleState.todos = remoteData.map(normalizeTodo);
    moduleState.loaded = true;
    moduleState.loading = false;
    renderTodos();
    decorateCalendar();
  }

  async function createTodo(input, { quiet = false } = {}) {
    const now = new Date().toISOString();
    const todo = normalizeTodo({
      id: uid(),
      title: input.title,
      dueDate: input.dueDate || null,
      assignee: input.assignee || '가족',
      note: input.note || '',
      recurrence: input.recurrence || 'none',
      completed: false,
      parentId: input.parentId || null,
      createdAt: now,
      updatedAt: now,
    });

    if (moduleState.storage === 'remote') {
      const context = familyContext();
      if (context) {
        const { data, error } = await context.supabase
          .from('family_todos')
          .insert(toRemote(todo, context))
          .select('id, title, due_date, assignee, note, recurrence, completed, completed_at, recurrence_parent_id, created_at, updated_at')
          .single();
        if (!error) {
          const saved = normalizeTodo(data);
          moduleState.todos.unshift(saved);
          renderTodos();
          decorateCalendar();
          if (!quiet) announce('할 일을 추가했어요.');
          return saved;
        }
        if (!isMissingTable(error) && error.code !== '23505') throw error;
        if (error.code === '23505') return null;
        moduleState.storage = 'local';
      }
    }

    moduleState.todos.unshift(todo);
    writeLocalTodos();
    renderTodos();
    decorateCalendar();
    if (!quiet) announce('할 일을 추가했어요.');
    return todo;
  }

  function remotePatch(patch) {
    const mapped = {};
    if ('title' in patch) mapped.title = patch.title;
    if ('dueDate' in patch) mapped.due_date = patch.dueDate || null;
    if ('assignee' in patch) mapped.assignee = patch.assignee;
    if ('note' in patch) mapped.note = patch.note || null;
    if ('recurrence' in patch) mapped.recurrence = patch.recurrence;
    if ('completed' in patch) mapped.completed = Boolean(patch.completed);
    if ('completedAt' in patch) mapped.completed_at = patch.completedAt || null;
    mapped.updated_at = new Date().toISOString();
    return mapped;
  }

  async function updateTodo(id, patch, { quiet = false } = {}) {
    const index = moduleState.todos.findIndex((todo) => todo.id === id);
    if (index < 0) return null;

    if (moduleState.storage === 'remote') {
      const context = familyContext();
      if (context) {
        const { data, error } = await context.supabase
          .from('family_todos')
          .update(remotePatch(patch))
          .eq('id', id)
          .eq('household_id', context.household.id)
          .select('id, title, due_date, assignee, note, recurrence, completed, completed_at, recurrence_parent_id, created_at, updated_at')
          .single();
        if (!error) {
          moduleState.todos[index] = normalizeTodo(data);
          renderTodos();
          decorateCalendar();
          if (!quiet) announce('할 일을 수정했어요.');
          return moduleState.todos[index];
        }
        if (!isMissingTable(error)) throw error;
        moduleState.storage = 'local';
      }
    }

    moduleState.todos[index] = normalizeTodo({ ...moduleState.todos[index], ...patch, updatedAt: new Date().toISOString() });
    writeLocalTodos();
    renderTodos();
    decorateCalendar();
    if (!quiet) announce('할 일을 수정했어요.');
    return moduleState.todos[index];
  }

  async function deleteTodo(id) {
    const index = moduleState.todos.findIndex((todo) => todo.id === id);
    if (index < 0) return;

    if (moduleState.storage === 'remote') {
      const context = familyContext();
      if (context) {
        const { error } = await context.supabase
          .from('family_todos')
          .delete()
          .eq('id', id)
          .eq('household_id', context.household.id);
        if (error && !isMissingTable(error)) throw error;
        if (error && isMissingTable(error)) moduleState.storage = 'local';
      }
    }

    moduleState.todos.splice(index, 1);
    if (moduleState.storage === 'local') writeLocalTodos();
    renderTodos();
    decorateCalendar();
    announce('할 일을 삭제했어요.');
  }

  function recurrenceLabel(value) {
    return ({ daily: '매일', weekly: '매주', monthly: '매월' })[value] || '';
  }

  function dueLabel(todo) {
    if (!todo.dueDate) return '기한 없음';
    const today = dateKey();
    if (todo.dueDate === today) return '오늘';
    const due = parseDate(todo.dueDate);
    const base = parseDate(today);
    const difference = Math.round((due - base) / 86400000);
    if (difference === 1) return '내일';
    if (difference < 0 && !todo.completed) return `${Math.abs(difference)}일 지남`;
    return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(due);
  }

  function filteredTodos() {
    const today = dateKey();
    const items = moduleState.todos.filter((todo) => {
      if (moduleState.filter === 'completed') return todo.completed;
      if (todo.completed) return false;
      if (moduleState.filter === 'today') return Boolean(todo.dueDate && todo.dueDate <= today);
      return !todo.dueDate || todo.dueDate > today;
    });

    return items.sort((left, right) => {
      if (moduleState.filter === 'completed') {
        return String(right.completedAt || right.updatedAt).localeCompare(String(left.completedAt || left.updatedAt));
      }
      if (!left.dueDate && right.dueDate) return 1;
      if (left.dueDate && !right.dueDate) return -1;
      return String(left.dueDate || '').localeCompare(String(right.dueDate || '')) || left.title.localeCompare(right.title, 'ko');
    });
  }

  function renderStats() {
    const today = dateKey();
    const todayCount = moduleState.todos.filter((todo) => !todo.completed && todo.dueDate && todo.dueDate <= today).length;
    const upcomingCount = moduleState.todos.filter((todo) => !todo.completed && (!todo.dueDate || todo.dueDate > today)).length;
    const completedCount = moduleState.todos.filter((todo) => todo.completed).length;
    todoView.querySelector('#todoTodayCount').textContent = String(todayCount);
    todoView.querySelector('#todoUpcomingCount').textContent = String(upcomingCount);
    todoView.querySelector('#todoCompletedCount').textContent = String(completedCount);
  }

  function renderTodos() {
    renderStats();
    updateStorageNote();
    todoView.querySelectorAll('[data-todo-filter]').forEach((button) => {
      const active = button.dataset.todoFilter === moduleState.filter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });

    if (moduleState.loading && !moduleState.loaded) {
      list.innerHTML = '<div class="todo-empty-state loading"><span>↻</span><strong>할 일을 불러오는 중이에요</strong></div>';
      return;
    }

    const items = filteredTodos();
    if (!items.length) {
      const copy = moduleState.filter === 'completed'
        ? ['아직 완료한 일이 없어요', '하나씩 체크하면 여기에 차곡차곡 모여요.']
        : moduleState.filter === 'today'
          ? ['오늘 할 일을 모두 챙겼어요', '새 할 일이 생기면 바로 추가해 보세요.']
          : ['예정된 할 일이 없어요', '마감일을 정해 가족과 함께 준비해요.'];
      list.innerHTML = `<div class="todo-empty-state"><span aria-hidden="true">✓</span><strong>${copy[0]}</strong><small>${copy[1]}</small></div>`;
      return;
    }

    list.innerHTML = items.map((todo) => {
      const overdue = !todo.completed && todo.dueDate && todo.dueDate < dateKey();
      const busy = moduleState.busyIds.has(todo.id);
      return `
        <article class="family-todo-item${todo.completed ? ' completed' : ''}${overdue ? ' overdue' : ''}" data-todo-id="${escapeText(todo.id)}">
          <button class="todo-check-button" type="button" data-todo-toggle aria-label="${todo.completed ? '완료 취소' : '완료 처리'}" aria-pressed="${todo.completed}"${busy ? ' disabled' : ''}>
            <span aria-hidden="true">${todo.completed ? '✓' : ''}</span>
          </button>
          <button class="todo-item-main" type="button" data-todo-edit>
            <strong>${escapeText(todo.title)}</strong>
            <span class="todo-item-meta">
              <i class="todo-due-chip${overdue ? ' overdue' : ''}">${escapeText(dueLabel(todo))}</i>
              <i class="todo-assignee-chip">${escapeText(todo.assignee || '가족')}</i>
              ${todo.recurrence !== 'none' ? `<i class="todo-repeat-chip">↻ ${escapeText(recurrenceLabel(todo.recurrence))}</i>` : ''}
            </span>
            ${todo.note ? `<small>${escapeText(todo.note)}</small>` : ''}
          </button>
          <button class="todo-more-button" type="button" data-todo-edit aria-label="${escapeText(todo.title)} 수정">•••</button>
        </article>
      `;
    }).join('');
  }

  function decorateCalendar() {
    if (!calendarGrid) return;
    const counts = new Map();
    moduleState.todos.forEach((todo) => {
      if (!todo.completed && todo.dueDate) counts.set(todo.dueDate, (counts.get(todo.dueDate) || 0) + 1);
    });
    calendarGrid.querySelectorAll('.calendar-day[data-date]').forEach((button) => {
      button.querySelector('.todo-day-indicator')?.remove();
      button.classList.remove('has-family-todos');
      const currentLabel = button.getAttribute('aria-label') || '';
      const baseLabel = button.dataset.todoBaseAria || currentLabel.replace(/, 할 일 \d+개$/, '');
      button.dataset.todoBaseAria = baseLabel;
      const count = counts.get(button.dataset.date) || 0;
      if (!count) {
        button.setAttribute('aria-label', baseLabel);
        return;
      }
      button.classList.add('has-family-todos');
      const indicator = document.createElement('span');
      indicator.className = 'todo-day-indicator';
      indicator.textContent = count > 1 ? `✓${count}` : '✓';
      indicator.setAttribute('aria-hidden', 'true');
      button.appendChild(indicator);
      button.setAttribute('aria-label', `${baseLabel}, 할 일 ${count}개`);
    });
  }

  function setMode(mode, { persist = true } = {}) {
    moduleState.mode = mode === 'todo' ? 'todo' : 'calendar';
    if (persist) {
      try { localStorage.setItem(MODE_KEY, moduleState.mode); } catch { /* 현재 화면만 전환 */ }
    }
    calendarPanel.hidden = moduleState.mode !== 'calendar';
    todoView.hidden = moduleState.mode !== 'todo';
    subnav.querySelectorAll('[data-calendar-mode]').forEach((button) => {
      const active = button.dataset.calendarMode === moduleState.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    syncFab();
    if (moduleState.mode === 'todo') {
      if (!moduleState.loaded) loadTodos();
      else renderTodos();
    } else decorateCalendar();
  }

  function syncFab() {
    const eventFab = document.querySelector('#addEventButton');
    const calendarVisible = !calendarView.hidden;
    todoFab.hidden = !calendarVisible || moduleState.mode !== 'todo';
    if (eventFab && calendarVisible) eventFab.hidden = moduleState.mode === 'todo';
  }

  function setFilter(filter) {
    if (!VALID_FILTERS.has(filter)) return;
    moduleState.filter = filter;
    try { localStorage.setItem(FILTER_KEY, filter); } catch { /* 현재 필터만 유지 */ }
    renderTodos();
  }

  function fillAssignees(selected = '가족') {
    const members = [...new Set(currentMembers())];
    if (!members.includes(selected)) members.push(selected);
    assigneeInput.innerHTML = members.map((member) => `<option value="${escapeText(member)}"${member === selected ? ' selected' : ''}>${escapeText(member)}</option>`).join('');
  }

  function openTodoDialog(todo = null) {
    const editing = Boolean(todo);
    todoIdInput.value = todo?.id || '';
    titleInput.value = todo?.title || '';
    fillAssignees(todo?.assignee || '가족');
    dueDateInput.value = todo?.dueDate || dateKey();
    recurrenceInput.value = todo?.recurrence || 'none';
    noteInput.value = todo?.note || '';
    dialogTitle.textContent = editing ? '할 일 수정' : '새 할 일';
    saveButton.textContent = editing ? '수정 저장' : '할 일 추가';
    deleteButton.hidden = !editing;
    dialogHelp.textContent = todo?.completed ? '완료된 할 일이에요. 체크를 해제하면 다시 진행할 수 있어요.' : '가족 구성원 모두가 확인하고 완료할 수 있어요.';
    if (!dialog.open) dialog.showModal();
    setTimeout(() => titleInput.focus(), 100);
  }

  async function toggleTodo(todo) {
    if (!todo || moduleState.busyIds.has(todo.id)) return;
    moduleState.busyIds.add(todo.id);
    renderTodos();
    try {
      const completed = !todo.completed;
      const completedAt = completed ? new Date().toISOString() : null;
      await updateTodo(todo.id, { completed, completedAt }, { quiet: true });

      if (completed && todo.recurrence !== 'none' && todo.dueDate) {
        const nextDueDate = addRecurrence(todo.dueDate, todo.recurrence);
        if (nextDueDate) {
          const existing = moduleState.todos.some((item) => item.parentId === todo.id);
          if (!existing) {
            await createTodo({
              title: todo.title,
              dueDate: nextDueDate,
              assignee: todo.assignee,
              note: todo.note,
              recurrence: todo.recurrence,
              parentId: todo.id,
            }, { quiet: true });
          }
          announce(`완료했어요. 다음 ${recurrenceLabel(todo.recurrence)} 할 일도 만들었어요.`);
        }
      } else announce(completed ? '완료했어요 🎉' : '다시 할 일로 돌렸어요.');
    } catch {
      announce('완료 상태를 변경하지 못했어요.');
    } finally {
      moduleState.busyIds.delete(todo.id);
      renderTodos();
    }
  }

  subnav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-calendar-mode]');
    if (button) setMode(button.dataset.calendarMode);
  });

  todoView.querySelector('.todo-filter-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-todo-filter]');
    if (button) setFilter(button.dataset.todoFilter);
  });

  quickForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = quickTitle.value.trim();
    if (!title) return;
    const button = quickForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await createTodo({ title, dueDate: dateKey(), assignee: '가족', recurrence: 'none', note: '' });
      quickTitle.value = '';
      setFilter('today');
    } catch { announce('할 일을 추가하지 못했어요.'); }
    finally { button.disabled = false; }
  });

  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-todo-id]');
    if (!item) return;
    const todo = moduleState.todos.find((entry) => entry.id === item.dataset.todoId);
    if (!todo) return;
    if (event.target.closest('[data-todo-toggle]')) toggleTodo(todo);
    else if (event.target.closest('[data-todo-edit]')) openTodoDialog(todo);
  });

  todoFab.addEventListener('click', () => openTodoDialog());
  refreshButton.addEventListener('click', async () => {
    refreshButton.disabled = true;
    await loadTodos({ silent: true });
    refreshButton.disabled = false;
    announce('가족 할 일을 새로고침했어요.');
  });

  dialog.querySelector('[data-todo-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  recurrenceInput.addEventListener('change', () => {
    if (recurrenceInput.value !== 'none' && !dueDateInput.value) dueDateInput.value = dateKey();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    const recurrence = VALID_RECURRENCES.has(recurrenceInput.value) ? recurrenceInput.value : 'none';
    if (!title) return titleInput.focus();
    if (recurrence !== 'none' && !dueDateInput.value) {
      dialogHelp.textContent = '반복 할 일에는 마감일이 필요해요.';
      dueDateInput.focus();
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = '저장 중…';
    try {
      const values = {
        title,
        dueDate: dueDateInput.value || null,
        assignee: assigneeInput.value || '가족',
        recurrence,
        note: noteInput.value.trim(),
      };
      if (todoIdInput.value) await updateTodo(todoIdInput.value, values);
      else await createTodo(values);
      dialog.close();
    } catch { announce('할 일을 저장하지 못했어요.'); }
    finally {
      saveButton.disabled = false;
      saveButton.textContent = todoIdInput.value ? '수정 저장' : '할 일 추가';
    }
  });

  deleteButton.addEventListener('click', async () => {
    const id = todoIdInput.value;
    if (!id || !window.confirm('이 할 일을 삭제할까요?')) return;
    deleteButton.disabled = true;
    try {
      await deleteTodo(id);
      dialog.close();
    } catch { announce('할 일을 삭제하지 못했어요.'); }
    finally { deleteButton.disabled = false; }
  });

  const calendarVisibilityObserver = new MutationObserver(syncFab);
  calendarVisibilityObserver.observe(calendarView, { attributes: true, attributeFilter: ['hidden'] });

  if (calendarGrid) {
    const gridObserver = new MutationObserver((mutations) => {
      const calendarChanged = mutations.some((mutation) => [...mutation.addedNodes].some((node) => (
        node.nodeType === 1 && (node.matches?.('.calendar-day') || node.querySelector?.('.calendar-day'))
      )));
      if (calendarChanged) requestAnimationFrame(decorateCalendar);
    });
    gridObserver.observe(calendarGrid, { childList: true });
  }

  document.querySelector('.view-tabs')?.addEventListener('click', () => setTimeout(syncFab, 0));
  window.addEventListener('focus', () => {
    if (moduleState.mode === 'todo' && moduleState.storage === 'remote') loadTodos({ silent: true });
  });

  setMode(moduleState.mode, { persist: false });
  loadTodos({ silent: true });
})();
