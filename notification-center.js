(() => {
  if (document.querySelector('[data-notification-center-module]')) return;

  const STORAGE_PREFIX = 'family-notification-center-v2';
  const EVENT_PRESETS = new Set(['none', 'at-time', 'before-10', 'before-60', 'custom']);
  const TODO_PRESETS = new Set(['none', 'due-morning', 'day-before', 'custom']);
  const POLL_INTERVAL_MS = 30_000;
  const TODO_REFRESH_MS = 3 * 60_000;
  const DAY_MS = 86_400_000;
  const HISTORY_WINDOW_MS = 90 * DAY_MS;
  const UPCOMING_WINDOW_MS = 365 * DAY_MS;

  const topbarActions = document.querySelector('.topbar-account-actions');
  if (!topbarActions) return;

  let activeScope = '';
  let store = null;
  let items = [];
  let todoSnapshot = [];
  let remoteRows = [];
  let lastTodoLoadAt = 0;
  let todoLoadPromise = null;
  let remoteLoadPromise = null;
  let remoteSupported = true;
  let refreshTimer = null;
  let renderQueued = false;
  let pendingTodoSave = null;
  let realtimeChannel = null;
  let realtimeScope = '';

  const scopeKey = () => {
    if (typeof state !== 'undefined' && state.session?.user?.id && state.household?.id) {
      return `${state.session.user.id}:${state.household.id}`;
    }
    return 'device';
  };

  const storageKey = () => `${STORAGE_PREFIX}:${scopeKey()}`;
  const remoteReady = () => Boolean(
    remoteSupported
    && typeof state !== 'undefined'
    && state.supabase
    && state.session?.user?.id
    && state.household?.id,
  );

  const emptyStore = () => ({
    version: 2,
    filter: 'new',
    read: {},
    dismissed: {},
    delivered: {},
    eventReminders: {},
    todoReminders: {},
  });

  const sanitizeRecord = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  const readStore = () => {
    activeScope = scopeKey();
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey()) || 'null') || {};
      return {
        ...emptyStore(),
        ...parsed,
        filter: ['new', 'upcoming', 'history'].includes(parsed.filter) ? parsed.filter : 'new',
        read: sanitizeRecord(parsed.read),
        dismissed: sanitizeRecord(parsed.dismissed),
        delivered: sanitizeRecord(parsed.delivered),
        eventReminders: sanitizeRecord(parsed.eventReminders),
        todoReminders: sanitizeRecord(parsed.todoReminders),
      };
    } catch {
      return emptyStore();
    }
  };

  const persist = () => {
    try { localStorage.setItem(storageKey(), JSON.stringify(store)); }
    catch { /* 현재 화면에서는 계속 동작 */ }
  };

  const ensureScope = () => {
    const nextScope = scopeKey();
    if (store && nextScope === activeScope) return;
    store = readStore();
    todoSnapshot = [];
    remoteRows = [];
    lastTodoLoadAt = 0;
    remoteSupported = true;
  };

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);

  const dateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseLocalDateTime = (date, time = '09:00') => {
    if (!date) return null;
    const parsed = new Date(`${date}T${time || '09:00'}:00`);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  };

  const parseCustomDateTime = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  };

  const formatDateTime = (timestamp, allDay = false) => {
    const date = new Date(timestamp);
    const today = dateKey();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const prefix = dateKey(date) === today
      ? '오늘'
      : dateKey(date) === dateKey(tomorrow)
        ? '내일'
        : new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(date);
    if (allDay) return `${prefix} 종일`;
    return `${prefix} ${new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(date)}`;
  };

  const relativeTime = (timestamp) => {
    const difference = timestamp - Date.now();
    const absoluteMinutes = Math.round(Math.abs(difference) / 60_000);
    if (absoluteMinutes < 1) return difference > 0 ? '곧' : '방금';
    if (absoluteMinutes < 60) return difference > 0 ? `${absoluteMinutes}분 후` : `${absoluteMinutes}분 전`;
    const hours = Math.round(absoluteMinutes / 60);
    if (hours < 24) return difference > 0 ? `${hours}시간 후` : `${hours}시간 전`;
    const days = Math.round(hours / 24);
    return difference > 0 ? `${days}일 후` : `${days}일 전`;
  };

  const eventReminderConfig = (eventId) => {
    const saved = store.eventReminders[eventId] || {};
    const preset = EVENT_PRESETS.has(saved.preset) ? saved.preset : 'none';
    return { preset, customAt: String(saved.customAt || ''), enabled: saved.enabled !== false && preset !== 'none' };
  };

  const todoReminderConfig = (todoId) => {
    const saved = store.todoReminders[todoId] || {};
    const preset = TODO_PRESETS.has(saved.preset) ? saved.preset : 'none';
    return { preset, customAt: String(saved.customAt || ''), enabled: saved.enabled !== false && preset !== 'none' };
  };

  const eventReminderTimestamp = (event, config) => {
    if (!config.enabled) return null;
    if (config.preset === 'custom') return parseCustomDateTime(config.customAt)?.getTime() || null;
    const base = parseLocalDateTime(event.date, event.time || '09:00');
    if (!base) return null;
    if (config.preset === 'before-10') base.setMinutes(base.getMinutes() - 10);
    if (config.preset === 'before-60') base.setMinutes(base.getMinutes() - 60);
    return base.getTime();
  };

  const todoReminderTimestamp = (todo, config) => {
    if (config.enabled && config.preset === 'custom') return parseCustomDateTime(config.customAt)?.getTime() || null;
    if (!todo.dueDate) return null;
    const due = parseLocalDateTime(todo.dueDate, '09:00');
    if (!due) return null;
    if (config.enabled && config.preset === 'day-before') due.setDate(due.getDate() - 1);
    return due.getTime();
  };

  const itemState = (id) => ({
    read: Boolean(store.read[id]),
    dismissed: Boolean(store.dismissed[id]),
    delivered: Boolean(store.delivered[id]),
  });

  const createLocalItem = (input) => ({
    persistent: false,
    virtual: false,
    allDay: false,
    ...input,
    ...itemState(input.id),
  });

  const normalizeTodo = (todo = {}) => ({
    id: todo.id,
    title: String(todo.title || ''),
    dueDate: todo.dueDate ?? todo.due_date ?? null,
    assignee: String(todo.assignee || '가족'),
    completed: Boolean(todo.completed),
    createdAt: todo.createdAt ?? todo.created_at ?? '',
    updatedAt: todo.updatedAt ?? todo.updated_at ?? '',
  });

  const localTodoKey = () => {
    if (typeof state !== 'undefined' && state.household?.id) return `family-todos-v1:${state.household.id}`;
    return 'family-todos-v1';
  };

  const loadLocalTodos = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(localTodoKey()) || '[]');
      return Array.isArray(parsed) ? parsed.map(normalizeTodo) : [];
    } catch { return []; }
  };

  const loadTodos = async ({ force = false } = {}) => {
    ensureScope();
    if (!force && todoSnapshot.length && Date.now() - lastTodoLoadAt < TODO_REFRESH_MS) return todoSnapshot;
    if (todoLoadPromise) return todoLoadPromise;

    todoLoadPromise = (async () => {
      if (typeof state !== 'undefined' && state.supabase && state.session && state.household?.id) {
        try {
          const { data, error } = await state.supabase
            .from('family_todos')
            .select('id, title, due_date, assignee, completed, created_at, updated_at')
            .eq('household_id', state.household.id)
            .order('completed', { ascending: true })
            .order('due_date', { ascending: true, nullsFirst: false })
            .limit(500);
          todoSnapshot = error ? loadLocalTodos() : (data || []).map(normalizeTodo);
        } catch {
          todoSnapshot = loadLocalTodos();
        }
      } else {
        todoSnapshot = loadLocalTodos();
      }
      lastTodoLoadAt = Date.now();
      return todoSnapshot;
    })().finally(() => { todoLoadPromise = null; });

    return todoLoadPromise;
  };

  const normalizeRemoteNotification = (row = {}) => {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const scheduledAt = new Date(row.scheduled_at || row.created_at || Date.now()).getTime();
    const sourceType = String(row.source_type || 'notification');
    return {
      id: `db:${row.id}`,
      remoteId: row.id,
      kind: sourceType === 'event' ? 'event' : sourceType === 'todo' ? 'todo' : sourceType === 'briefing' ? 'briefing' : 'notification',
      sourceType,
      icon: String(row.icon || (sourceType === 'event' ? '📅' : sourceType === 'todo' ? '✅' : '🔔')),
      title: String(row.title || '알림'),
      body: String(row.body || ''),
      scheduledAt: Number.isFinite(scheduledAt) ? scheduledAt : Date.now(),
      sourceId: String(row.source_id || metadata.eventId || ''),
      sourceDate: String(row.source_date || metadata.date || ''),
      metadata,
      read: Boolean(row.read_at),
      dismissed: Boolean(row.dismissed_at),
      delivered: Boolean(row.delivered_at),
      deliverable: false,
      configurable: false,
      persistent: true,
      virtual: false,
      allDay: false,
    };
  };

  const loadRemoteNotifications = async ({ force = false } = {}) => {
    ensureScope();
    if (!remoteReady()) {
      remoteRows = [];
      return remoteRows;
    }
    if (!force && remoteRows.length) return remoteRows;
    if (remoteLoadPromise) return remoteLoadPromise;

    remoteLoadPromise = (async () => {
      const cutoff = new Date(Date.now() - HISTORY_WINDOW_MS).toISOString();
      try {
        const { data, error } = await state.supabase
          .from('notifications')
          .select('id,kind,title,body,icon,source_type,source_id,source_date,scheduled_at,read_at,dismissed_at,delivered_at,metadata,created_at')
          .eq('household_id', state.household.id)
          .eq('user_id', state.session.user.id)
          .gte('scheduled_at', cutoff)
          .is('dismissed_at', null)
          .order('scheduled_at', { ascending: false })
          .limit(500);
        if (error) {
          if (String(error.code) === '42P01' || /notifications/i.test(String(error.message || ''))) remoteSupported = false;
          throw error;
        }
        remoteRows = (data || []).map(normalizeRemoteNotification);
      } catch (error) {
        remoteRows = [];
        if (remoteSupported) console.warn('알림 이력을 불러오지 못했어요', error);
      }
      return remoteRows;
    })().finally(() => { remoteLoadPromise = null; });

    return remoteLoadPromise;
  };

  const buildEventItems = (now) => {
    if (typeof state === 'undefined' || !Array.isArray(state.events)) return [];
    return state.events.flatMap((event) => {
      const config = eventReminderConfig(event.id);
      const reminderAt = eventReminderTimestamp(event, config);
      if (reminderAt && reminderAt >= now - HISTORY_WINDOW_MS && reminderAt <= now + UPCOMING_WINDOW_MS) {
        return [createLocalItem({
          id: `event:${event.id}:${reminderAt}`,
          kind: 'event',
          icon: '📅',
          title: event.title,
          body: `${event.member || '가족'} 일정 · ${event.time || '종일'}`,
          scheduledAt: reminderAt,
          sourceId: event.id,
          sourceDate: event.date,
          deliverable: true,
          configurable: true,
        })];
      }

      const scheduleAt = parseLocalDateTime(event.date, event.time || '23:59')?.getTime();
      if (!scheduleAt || scheduleAt <= now || scheduleAt > now + UPCOMING_WINDOW_MS) return [];
      return [createLocalItem({
        id: `schedule:event:${event.id}:${scheduleAt}`,
        kind: 'event',
        icon: '📅',
        title: event.title,
        body: `${event.member || '가족'} 일정 · ${event.time || '종일'}`,
        scheduledAt: scheduleAt,
        sourceId: event.id,
        sourceDate: event.date,
        deliverable: false,
        configurable: false,
        virtual: true,
        allDay: !event.time,
      })];
    });
  };

  const buildTodoItems = (now) => todoSnapshot.flatMap((todo) => {
    if (!todo.id || todo.completed || !todo.dueDate) return [];
    const config = todoReminderConfig(todo.id);
    const configuredAt = todoReminderTimestamp(todo, config);
    if (config.enabled && configuredAt && configuredAt >= now - HISTORY_WINDOW_MS && configuredAt <= now + UPCOMING_WINDOW_MS) {
      return [createLocalItem({
        id: `todo:${todo.id}:${configuredAt}`,
        kind: 'todo',
        icon: '✅',
        title: todo.title,
        body: `${todo.assignee || '가족'} 담당 · 마감 ${todo.dueDate.replaceAll('-', '.')}`,
        scheduledAt: configuredAt,
        sourceId: todo.id,
        sourceDate: todo.dueDate,
        deliverable: true,
        configurable: true,
      })];
    }

    const scheduleAt = parseLocalDateTime(todo.dueDate, '23:59')?.getTime();
    if (!scheduleAt || scheduleAt <= now || scheduleAt > now + UPCOMING_WINDOW_MS) return [];
    return [createLocalItem({
      id: `schedule:todo:${todo.id}:${scheduleAt}`,
      kind: 'todo',
      icon: '✅',
      title: todo.title,
      body: `${todo.assignee || '가족'} 담당 · 마감 ${todo.dueDate.replaceAll('-', '.')}`,
      scheduledAt: scheduleAt,
      sourceId: todo.id,
      sourceDate: todo.dueDate,
      deliverable: false,
      configurable: false,
      virtual: true,
      allDay: true,
    })];
  });

  const readBriefingSettings = () => {
    let key = 'family-daily-briefing-v1:device';
    if (typeof state !== 'undefined' && state.session?.user?.id && state.household?.id) {
      key = `family-daily-briefing-v1:${state.session.user.id}:${state.household.id}`;
    }
    try { return JSON.parse(localStorage.getItem(key) || 'null') || null; }
    catch { return null; }
  };

  const buildBriefingItem = () => {
    const settings = readBriefingSettings();
    if (!settings?.enabled || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(settings.time || '')) return [];
    const scheduled = parseLocalDateTime(dateKey(), settings.time);
    if (!scheduled) return [];
    if (scheduled.getTime() <= Date.now()) scheduled.setDate(scheduled.getDate() + 1);
    const scheduledAt = scheduled.getTime();
    return [createLocalItem({
      id: `briefing:${dateKey(scheduled)}:${settings.time}`,
      kind: 'briefing',
      icon: '🔔',
      title: '아침 일정 브리핑',
      body: settings.pushReady ? '오늘 일정을 앱 알림으로 요약해요.' : '알림 서버 연결을 확인해 주세요.',
      scheduledAt,
      sourceId: 'dailyBriefingSettings',
      deliverable: false,
      configurable: false,
      virtual: true,
    })];
  };

  const feedingStorageKey = () => {
    const babyId = typeof state !== 'undefined' ? state.activeBabyId || 'no-baby' : 'no-baby';
    if (typeof state !== 'undefined' && state.session?.user?.id && state.household?.id) {
      return `family-feeding-reminder-v1:${state.session.user.id}:${state.household.id}:${babyId}`;
    }
    return `family-feeding-reminder-v1:device:${babyId}`;
  };

  const feedingTypeOf = (entry) => {
    if (entry.category !== '수유·이유식') return '';
    const feedingType = String(entry.feedingType || '').trim();
    const title = String(entry.title || '');
    return feedingType === '모유' || title.includes('모유') ? 'breast' : 'formula';
  };

  const buildFeedingItem = (now) => {
    if (typeof state === 'undefined' || !state.activeBabyId || !Array.isArray(state.growthEntries)) return [];
    let settings;
    try { settings = JSON.parse(localStorage.getItem(feedingStorageKey()) || 'null'); }
    catch { settings = null; }
    if (!settings?.enabled) return [];
    const target = ['breast', 'formula', 'all'].includes(settings.target) ? settings.target : 'breast';
    const latest = state.growthEntries
      .filter((entry) => (!entry.babyId || entry.babyId === state.activeBabyId) && feedingTypeOf(entry) && (target === 'all' || feedingTypeOf(entry) === target))
      .map((entry) => ({ timestamp: parseLocalDateTime(entry.date, entry.time || '00:00')?.getTime() || 0 }))
      .filter((entry) => entry.timestamp > 0 && entry.timestamp <= now)
      .sort((left, right) => right.timestamp - left.timestamp)[0];
    const baseTimestamp = Math.max(latest?.timestamp || 0, Number(settings.enabledAt) || 0) || now;
    const scheduledAt = baseTimestamp + Math.max(15, Number(settings.intervalMinutes) || 180) * 60_000;
    if (scheduledAt < now - HISTORY_WINDOW_MS || scheduledAt > now + UPCOMING_WINDOW_MS) return [];
    const label = ({ breast: '모유', formula: '분유', all: '수유' })[target];
    return [createLocalItem({
      id: `feeding:${state.activeBabyId}:${target}:${baseTimestamp}`,
      kind: 'feeding',
      icon: '🍼',
      title: `${label} 알림`,
      body: `마지막 ${label} 기록 기준`,
      scheduledAt,
      sourceId: state.activeBabyId,
      deliverable: false,
      configurable: false,
      virtual: true,
    })];
  };

  const pruneStore = () => {
    const cutoff = Date.now() - HISTORY_WINDOW_MS;
    ['read', 'dismissed', 'delivered'].forEach((name) => {
      Object.entries(store[name]).forEach(([id, timestamp]) => {
        if (Number(timestamp) < cutoff) delete store[name][id];
      });
    });
    if (typeof state !== 'undefined' && Array.isArray(state.events)) {
      const eventIds = new Set(state.events.map((event) => event.id));
      Object.keys(store.eventReminders).forEach((id) => { if (!eventIds.has(id)) delete store.eventReminders[id]; });
    }
    const todoIds = new Set(todoSnapshot.map((todo) => todo.id));
    if (todoSnapshot.length) Object.keys(store.todoReminders).forEach((id) => { if (!todoIds.has(id)) delete store.todoReminders[id]; });
  };

  const visibleItems = () => items.filter((item) => !item.dismissed);
  const newItems = () => visibleItems().filter((item) => !item.virtual && item.scheduledAt <= Date.now() && !item.read);
  const upcomingItems = () => visibleItems().filter((item) => item.scheduledAt > Date.now());
  const historyItems = () => visibleItems().filter((item) => !item.virtual && item.scheduledAt <= Date.now() && item.read);

  const showSystemNotification = async (item) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const options = {
      body: item.body,
      tag: item.id,
      renotify: false,
      icon: 'assets/family-mascots.webp',
      badge: 'assets/family-mascots.webp',
      data: { url: './' },
    };
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(`우리 가족 · ${item.title}`, options);
      } else {
        new Notification(`우리 가족 · ${item.title}`, options);
      }
    } catch { /* 목록 배지는 유지 */ }
  };

  const deliverDueItems = async () => {
    const now = Date.now();
    const due = items.filter((item) => !item.persistent && item.deliverable && !item.dismissed && !item.delivered && item.scheduledAt <= now && item.scheduledAt >= now - DAY_MS);
    if (!due.length) return;
    due.forEach((item) => { store.delivered[item.id] = now; item.delivered = true; });
    persist();
    if (document.visibilityState === 'visible') {
      if (typeof toast === 'function') toast(due.length === 1 ? `${due[0].title} 알림이에요 🔔` : `${due.length}개의 새 알림이 있어요 🔔`);
      return;
    }
    await Promise.all(due.slice(0, 3).map(showSystemNotification));
  };

  const button = document.createElement('button');
  button.id = 'notificationCenterButton';
  button.className = 'notification-center-button';
  button.type = 'button';
  button.dataset.notificationCenterModule = '';
  button.setAttribute('aria-label', '알림 목록 열기');
  button.innerHTML = '<span aria-hidden="true">🔔</span><b id="notificationCenterBadge" hidden>0</b>';
  topbarActions.insertBefore(button, topbarActions.querySelector('#accountButton'));
  document.body.classList.add('notification-center-installed');

  const dialog = document.createElement('dialog');
  dialog.id = 'notificationCenterDialog';
  dialog.className = 'notification-center-dialog';
  dialog.innerHTML = `
    <div class="notification-center-panel">
      <div class="sheet-handle"></div>
      <header class="notification-center-header">
        <div><p class="eyebrow">NOTIFICATIONS</p><h2>알림</h2></div>
        <div class="notification-center-header-actions">
          <button id="notificationMarkAllRead" type="button">모두 읽음</button>
          <button class="close-button" type="button" data-notification-close aria-label="알림 닫기">×</button>
        </div>
      </header>
      <nav class="notification-center-tabs" role="tablist" aria-label="알림 구분">
        <button type="button" data-notification-filter="new" role="tab">새 알림 <span>0</span></button>
        <button type="button" data-notification-filter="upcoming" role="tab">예정 <span>0</span></button>
        <button type="button" data-notification-filter="history" role="tab">지난 알림 <span>0</span></button>
      </nav>
      <div class="notification-center-list" id="notificationCenterList" aria-live="polite"></div>
      <p class="notification-center-guide">앞으로의 일정·할 일과 가족 변경 알림을 한곳에 모아 보여줘요.</p>
    </div>`;
  document.body.appendChild(dialog);

  const list = dialog.querySelector('#notificationCenterList');
  const markAllButton = dialog.querySelector('#notificationMarkAllRead');

  const emptyCopy = {
    new: ['새 알림이 없어요', '가족 일정 변경이나 마감 알림이 생기면 여기에 표시돼요.'],
    upcoming: ['예정된 일정이 없어요', '앞으로의 일정과 마감 있는 할 일이 자동으로 표시돼요.'],
    history: ['지난 알림이 없어요', '확인한 알림이 모든 기기에서 여기에 남아요.'],
  };

  const itemActionLabel = (item) => ({ event: '일정 열기', todo: '할 일 열기', feeding: '성장 기록 열기', briefing: '설정 열기' })[item.kind] || '확인';

  const renderList = () => {
    const counts = { new: newItems().length, upcoming: upcomingItems().length, history: historyItems().length };
    dialog.querySelectorAll('[data-notification-filter]').forEach((tab) => {
      const filter = tab.dataset.notificationFilter;
      const active = filter === store.filter;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.querySelector('span').textContent = String(counts[filter]);
    });
    markAllButton.hidden = counts.new === 0;

    const filtered = store.filter === 'new' ? newItems() : store.filter === 'upcoming' ? upcomingItems() : historyItems();
    filtered.sort((left, right) => store.filter === 'history' ? right.scheduledAt - left.scheduledAt : left.scheduledAt - right.scheduledAt);
    if (!filtered.length) {
      const copy = emptyCopy[store.filter];
      list.innerHTML = `<div class="notification-empty"><span aria-hidden="true">🔔</span><strong>${copy[0]}</strong><small>${copy[1]}</small></div>`;
      return;
    }

    list.innerHTML = filtered.map((item) => `
      <article class="notification-item${item.read ? ' read' : ''}${item.virtual ? ' fallback' : ''}" data-notification-id="${escapeHtml(item.id)}">
        <div class="notification-delete-backdrop"><span>삭제</span></div>
        <div class="notification-item-foreground">
          <button class="notification-item-main" type="button" data-notification-open>
            <span class="notification-item-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
            <span class="notification-item-copy">
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.body)}</small>
              <em>${escapeHtml(formatDateTime(item.scheduledAt, item.allDay))} · ${escapeHtml(relativeTime(item.scheduledAt))}</em>
            </span>
            ${!item.read && !item.virtual && item.scheduledAt <= Date.now() ? '<i class="notification-unread-dot" aria-label="읽지 않음"></i>' : ''}
          </button>
          <div class="notification-item-actions">
            <button type="button" data-notification-open>${itemActionLabel(item)}</button>
            ${item.configurable ? '<button type="button" data-notification-disable>알림 끄기</button>' : ''}
            <button type="button" data-notification-dismiss>삭제</button>
          </div>
        </div>
      </article>`).join('');
    installSwipeHandlers();
  };

  const updateBadge = () => {
    const badge = button.querySelector('#notificationCenterBadge');
    const count = newItems().length;
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    button.classList.toggle('has-unread', count > 0);
    button.setAttribute('aria-label', count ? `읽지 않은 알림 ${count}개` : '알림 목록 열기');
  };

  const render = () => {
    renderQueued = false;
    updateBadge();
    if (dialog.open) renderList();
  };

  const queueRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(render);
  };

  const refresh = async ({ forceTodos = false, forceRemote = false } = {}) => {
    ensureScope();
    await Promise.all([
      loadTodos({ force: forceTodos }),
      loadRemoteNotifications({ force: forceRemote }),
    ]);
    const now = Date.now();
    items = [
      ...remoteRows,
      ...buildEventItems(now),
      ...buildTodoItems(now),
      ...buildFeedingItem(now),
      ...buildBriefingItem(),
    ].filter((item) => !item.dismissed);
    pruneStore();
    persist();
    await deliverDueItems();
    queueRender();
  };

  const updateRemote = async (item, patch) => {
    if (!item.persistent || !item.remoteId || !remoteReady()) return true;
    const { error } = await state.supabase
      .from('notifications')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', item.remoteId)
      .eq('user_id', state.session.user.id)
      .eq('household_id', state.household.id);
    if (error) {
      console.warn('알림 상태를 동기화하지 못했어요', error);
      return false;
    }
    return true;
  };

  const markRead = async (item) => {
    if (item.read || item.virtual) return;
    const now = Date.now();
    item.read = true;
    if (item.persistent) {
      await updateRemote(item, { read_at: new Date(now).toISOString() });
    } else {
      store.read[item.id] = now;
      persist();
    }
    queueRender();
  };

  const dismissItem = async (item) => {
    const now = Date.now();
    item.dismissed = true;
    if (item.persistent) {
      await updateRemote(item, { dismissed_at: new Date(now).toISOString() });
    } else {
      store.dismissed[item.id] = now;
      persist();
    }
    await refresh({ forceRemote: item.persistent });
  };

  const disableItem = (item) => {
    if (item.kind === 'event') {
      const config = eventReminderConfig(item.sourceId);
      store.eventReminders[item.sourceId] = { ...config, enabled: false };
    }
    if (item.kind === 'todo') {
      const config = todoReminderConfig(item.sourceId);
      store.todoReminders[item.sourceId] = { ...config, enabled: false };
    }
    persist();
    refresh();
    if (typeof toast === 'function') toast('이 항목의 알림을 껐어요');
  };

  const waitForTodoItem = (todoId, attempt = 0) => {
    const escaped = window.CSS?.escape ? window.CSS.escape(todoId) : String(todoId).replace(/["\\]/g, '\\$&');
    const row = document.querySelector(`[data-todo-id="${escaped}"] [data-todo-edit]`);
    if (row) return row.click();
    if (attempt < 20) setTimeout(() => waitForTodoItem(todoId, attempt + 1), 100);
  };

  const openSource = async (item) => {
    await markRead(item);
    dialog.close();
    if ((item.kind === 'event' || item.sourceType === 'event') && typeof state !== 'undefined') {
      const event = state.events?.find((entry) => String(entry.id) === String(item.sourceId));
      if (typeof window.switchView === 'function') window.switchView('calendar');
      const targetDate = event?.date || item.sourceDate;
      if (targetDate) {
        state.selectedDate = targetDate;
        if (typeof window.parseDate === 'function' && typeof window.startOfMonth === 'function') state.viewDate = window.startOfMonth(window.parseDate(targetDate));
        if (typeof window.render === 'function') window.render();
      }
      if (event && typeof window.openEventDialog === 'function') window.openEventDialog(event);
      return;
    }
    if (item.kind === 'todo' || item.sourceType === 'todo') {
      if (typeof window.switchView === 'function') window.switchView('calendar');
      document.querySelector('[data-calendar-mode="todo"]')?.click();
      if (item.sourceId) waitForTodoItem(item.sourceId);
      return;
    }
    if (item.kind === 'feeding') {
      if (typeof window.switchView === 'function') window.switchView('growth');
      setTimeout(() => document.querySelector('#feedingReminderAlert, #feedingReminderSettings')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
      return;
    }
    if (item.kind === 'briefing') {
      if (typeof window.switchView === 'function') window.switchView('settings');
      setTimeout(() => document.querySelector('#dailyBriefingSettings')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    }
  };

  const installSwipeHandlers = () => {
    list.querySelectorAll('.notification-item').forEach((article) => {
      const foreground = article.querySelector('.notification-item-foreground');
      let startX = 0;
      let deltaX = 0;
      let tracking = false;
      article.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (event.target.closest('button') && !event.target.closest('[data-notification-open]')) return;
        startX = event.clientX;
        deltaX = 0;
        tracking = true;
        foreground.setPointerCapture?.(event.pointerId);
        foreground.classList.add('swiping');
      });
      article.addEventListener('pointermove', (event) => {
        if (!tracking) return;
        deltaX = Math.min(0, Math.max(-88, event.clientX - startX));
        foreground.style.transform = `translateX(${deltaX}px)`;
      });
      const finish = () => {
        if (!tracking) return;
        tracking = false;
        foreground.classList.remove('swiping');
        if (deltaX <= -62) {
          const item = items.find((entry) => entry.id === article.dataset.notificationId);
          if (item) dismissItem(item);
          return;
        }
        foreground.style.transform = '';
      };
      article.addEventListener('pointerup', finish);
      article.addEventListener('pointercancel', finish);
    });
  };

  dialog.querySelector('[data-notification-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.querySelector('.notification-center-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-notification-filter]');
    if (!tab) return;
    store.filter = tab.dataset.notificationFilter;
    persist();
    renderList();
  });
  markAllButton.addEventListener('click', async () => {
    const now = new Date().toISOString();
    const current = newItems();
    const remoteIds = current.filter((item) => item.persistent && item.remoteId).map((item) => item.remoteId);
    current.forEach((item) => {
      item.read = true;
      if (!item.persistent) store.read[item.id] = Date.now();
    });
    persist();
    render();
    if (remoteIds.length && remoteReady()) {
      const { error } = await state.supabase
        .from('notifications')
        .update({ read_at: now, updated_at: now })
        .in('id', remoteIds)
        .eq('user_id', state.session.user.id)
        .eq('household_id', state.household.id);
      if (error) console.warn('모두 읽음 상태를 동기화하지 못했어요', error);
    }
  });
  list.addEventListener('click', (event) => {
    const article = event.target.closest('[data-notification-id]');
    if (!article) return;
    const item = items.find((entry) => entry.id === article.dataset.notificationId);
    if (!item) return;
    if (event.target.closest('[data-notification-dismiss]')) dismissItem(item);
    else if (event.target.closest('[data-notification-disable]')) disableItem(item);
    else if (event.target.closest('[data-notification-open]')) openSource(item);
  });
  button.addEventListener('click', async () => {
    await refresh({ forceTodos: true, forceRemote: true });
    if (!dialog.open) dialog.showModal();
    renderList();
  });

  const createReminderField = ({ id, options, customId, help }) => {
    const field = document.createElement('div');
    field.className = 'notification-reminder-field';
    field.innerHTML = `
      <label><span>알림</span><select id="${id}">${options}</select></label>
      <label class="notification-custom-time" hidden><span>직접 설정</span><input id="${customId}" type="datetime-local"></label>
      <small>${help}</small>`;
    return field;
  };

  const syncCustomField = (field, preset) => {
    const custom = field.querySelector('.notification-custom-time');
    custom.hidden = preset !== 'custom';
    custom.querySelector('input').required = preset === 'custom';
  };

  const installEventReminderField = () => {
    const form = document.querySelector('#eventForm');
    const timeField = document.querySelector('#eventTimeField');
    if (!form || !timeField || form.querySelector('#eventReminderPreset')) return false;
    const field = createReminderField({
      id: 'eventReminderPreset',
      customId: 'eventReminderCustomAt',
      options: '<option value="none">알림 없음</option><option value="at-time">정시</option><option value="before-10">10분 전</option><option value="before-60">1시간 전</option><option value="custom">직접 설정</option>',
      help: '알림을 따로 켜지 않아도 예정 탭에는 일정이 자동으로 표시돼요.',
    });
    timeField.insertAdjacentElement('afterend', field);
    const preset = field.querySelector('#eventReminderPreset');
    const custom = field.querySelector('#eventReminderCustomAt');
    preset.addEventListener('change', () => syncCustomField(field, preset.value));

    const previousOpenEventDialog = window.openEventDialog;
    if (typeof previousOpenEventDialog === 'function' && !previousOpenEventDialog.__notificationCenterWrapped) {
      const wrapped = function (event = null) {
        const result = previousOpenEventDialog(event);
        const config = event?.id ? eventReminderConfig(event.id) : { preset: 'none', customAt: '', enabled: false };
        preset.value = config.enabled ? config.preset : 'none';
        custom.value = config.customAt || '';
        syncCustomField(field, preset.value);
        return result;
      };
      wrapped.__notificationCenterWrapped = true;
      window.openEventDialog = wrapped;
    }

    const previousStoreEvent = window.storeEvent;
    if (typeof previousStoreEvent === 'function' && !previousStoreEvent.__notificationCenterWrapped) {
      const wrapped = async function (item) {
        const saved = await previousStoreEvent(item);
        if (saved) {
          const selectedPreset = EVENT_PRESETS.has(preset.value) ? preset.value : 'none';
          store.eventReminders[item.id] = {
            preset: selectedPreset,
            customAt: selectedPreset === 'custom' ? custom.value : '',
            enabled: selectedPreset !== 'none',
          };
          persist();
          refresh({ forceRemote: true });
        }
        return saved;
      };
      wrapped.__notificationCenterWrapped = true;
      window.storeEvent = wrapped;
    }
    return true;
  };

  const waitForDialogClose = (target) => new Promise((resolve) => {
    if (!target.open) return resolve();
    target.addEventListener('close', resolve, { once: true });
  });

  const resolveCreatedTodo = async (pending) => {
    await loadTodos({ force: true });
    if (pending.id) return pending.id;
    const candidate = todoSnapshot
      .filter((todo) => !pending.beforeIds.has(todo.id))
      .filter((todo) => todo.title === pending.title && String(todo.dueDate || '') === String(pending.dueDate || '') && todo.assignee === pending.assignee)
      .sort((left, right) => String(right.createdAt || right.updatedAt).localeCompare(String(left.createdAt || left.updatedAt)))[0];
    return candidate?.id || null;
  };

  const installTodoReminderField = () => {
    const todoDialog = document.querySelector('#familyTodoDialog');
    const form = todoDialog?.querySelector('#familyTodoForm');
    const recurrence = todoDialog?.querySelector('#familyTodoRecurrence');
    if (!todoDialog || !form || !recurrence || form.querySelector('#todoReminderPreset')) return false;
    const field = createReminderField({
      id: 'todoReminderPreset',
      customId: 'todoReminderCustomAt',
      options: '<option value="none">알림 없음</option><option value="due-morning">마감일 오전 9시</option><option value="day-before">하루 전 오전 9시</option><option value="custom">직접 설정</option>',
      help: '마감일이 있으면 알림을 끈 상태에서도 예정 탭에 자동으로 표시돼요.',
    });
    recurrence.closest('label')?.insertAdjacentElement('afterend', field);
    const preset = field.querySelector('#todoReminderPreset');
    const custom = field.querySelector('#todoReminderCustomAt');
    preset.addEventListener('change', () => syncCustomField(field, preset.value));

    const syncFromDialog = () => {
      const id = todoDialog.querySelector('#familyTodoId')?.value || '';
      const config = id ? todoReminderConfig(id) : { preset: 'none', customAt: '', enabled: false };
      preset.value = config.enabled ? config.preset : 'none';
      custom.value = config.customAt || '';
      syncCustomField(field, preset.value);
    };
    const observer = new MutationObserver(() => { if (todoDialog.open) syncFromDialog(); });
    observer.observe(todoDialog, { attributes: true, attributeFilter: ['open'] });

    form.addEventListener('submit', async () => {
      const selectedPreset = TODO_PRESETS.has(preset.value) ? preset.value : 'none';
      pendingTodoSave = {
        id: todoDialog.querySelector('#familyTodoId')?.value || '',
        title: todoDialog.querySelector('#familyTodoTitleInput')?.value.trim() || '',
        dueDate: todoDialog.querySelector('#familyTodoDueDate')?.value || null,
        assignee: todoDialog.querySelector('#familyTodoAssignee')?.value || '가족',
        preset: selectedPreset,
        customAt: selectedPreset === 'custom' ? custom.value : '',
        beforeIds: new Set(todoSnapshot.map((todo) => todo.id)),
      };
      await waitForDialogClose(todoDialog);
      const pending = pendingTodoSave;
      pendingTodoSave = null;
      if (!pending) return;
      const id = await resolveCreatedTodo(pending);
      if (!id) return;
      store.todoReminders[id] = { preset: pending.preset, customAt: pending.customAt, enabled: pending.preset !== 'none' };
      persist();
      refresh({ forceTodos: true });
    }, { capture: true });
    return true;
  };

  const installFormFields = (attempt = 0) => {
    const eventReady = installEventReminderField();
    const todoReady = installTodoReminderField();
    if ((!eventReady || !todoReady) && attempt < 60) setTimeout(() => installFormFields(attempt + 1), 100);
  };

  const todoListObserver = new MutationObserver(() => {
    clearTimeout(todoListObserver.timer);
    todoListObserver.timer = setTimeout(() => refresh({ forceTodos: true }), 150);
  });
  const observeTodoList = (attempt = 0) => {
    const todoList = document.querySelector('#familyTodoList');
    if (todoList) return todoListObserver.observe(todoList, { childList: true, subtree: true });
    if (attempt < 60) setTimeout(() => observeTodoList(attempt + 1), 100);
  };

  const syncRealtime = () => {
    const nextScope = remoteReady() ? scopeKey() : '';
    if (nextScope === realtimeScope) return;
    if (realtimeChannel && typeof state !== 'undefined' && state.supabase) {
      state.supabase.removeChannel(realtimeChannel).catch(() => {});
    }
    realtimeChannel = null;
    realtimeScope = nextScope;
    if (!nextScope) return;
    realtimeChannel = state.supabase
      .channel(`family-notifications-${state.session.user.id}-${state.household.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${state.session.user.id}`,
      }, () => refresh({ forceRemote: true }))
      .subscribe();
  };

  window.addEventListener('familycontextchange', () => {
    store = null;
    ensureScope();
    syncRealtime();
    refresh({ forceTodos: true, forceRemote: true });
  });
  window.addEventListener('family:growth-entry-saved', () => refresh());
  window.addEventListener('focus', () => refresh({ forceTodos: true, forceRemote: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh({ forceTodos: true, forceRemote: true });
  });
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key.startsWith(STORAGE_PREFIX) || event.key.startsWith('family-feeding-reminder-v1') || event.key.startsWith('family-daily-briefing-v1')) {
      store = null;
      ensureScope();
      refresh({ forceTodos: true, forceRemote: true });
    }
  });

  store = readStore();
  installFormFields();
  observeTodoList();
  syncRealtime();
  refresh({ forceTodos: true, forceRemote: true });
  refreshTimer = setInterval(() => refresh({ forceRemote: true }), POLL_INTERVAL_MS);
  window.addEventListener('pagehide', () => {
    clearInterval(refreshTimer);
    if (realtimeChannel && typeof state !== 'undefined' && state.supabase) state.supabase.removeChannel(realtimeChannel);
  }, { once: true });
})();
