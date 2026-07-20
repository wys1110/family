(() => {
  if (document.querySelector('[data-event-recurrence-module]')) return;

  const RECURRENCES = new Set(['none', 'daily', 'weekly', 'monthly', 'yearly']);
  const MAX_OCCURRENCES = 400;
  const LABELS = {
    none: '반복 안 함',
    daily: '매일',
    weekly: '매주',
    monthly: '매월',
    yearly: '매년',
  };

  const form = document.querySelector('#eventForm');
  const timeField = document.querySelector('#eventTimeField');
  const submitButton = document.querySelector('#eventSubmitButton');
  if (!form || !timeField || !submitButton) return;

  const field = document.createElement('section');
  field.className = 'event-recurrence-field';
  field.dataset.eventRecurrenceModule = '';
  field.innerHTML = `
    <div class="event-recurrence-grid">
      <label><span>반복</span>
        <select id="eventRecurrence">
          <option value="none">반복 안 함</option>
          <option value="daily">매일</option>
          <option value="weekly">매주</option>
          <option value="monthly">매월</option>
          <option value="yearly">매년</option>
        </select>
      </label>
      <label id="eventRecurrenceUntilField" hidden><span>반복 종료일</span><input id="eventRecurrenceUntil" type="date" /></label>
    </div>
    <p id="eventRecurrenceSummary">반복하지 않는 일정이에요.</p>
    <small>반복 일정은 종료일까지 미리 생성되며, 이후에는 각 일정을 따로 수정·삭제할 수 있어요.</small>`;
  const reminderField = form.querySelector('.notification-reminder-field');
  if (reminderField) reminderField.insertAdjacentElement('afterend', field);
  else timeField.insertAdjacentElement('afterend', field);

  const recurrenceSelect = field.querySelector('#eventRecurrence');
  const untilField = field.querySelector('#eventRecurrenceUntilField');
  const untilInput = field.querySelector('#eventRecurrenceUntil');
  const summary = field.querySelector('#eventRecurrenceSummary');
  let saving = false;

  const parseDateKey = (value) => {
    const [year, month, day] = String(value || '').split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const toDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const addDaysToKey = (value, amount) => {
    const date = parseDateKey(value);
    date.setDate(date.getDate() + amount);
    return toDateKey(date);
  };

  const dayDistanceBetween = (startKey, endKey) => {
    const start = parseDateKey(startKey);
    const end = parseDateKey(endKey);
    return Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000);
  };

  const occurrenceDate = (baseKey, recurrence, index) => {
    const base = parseDateKey(baseKey);
    if (recurrence === 'daily') return addDaysToKey(baseKey, index);
    if (recurrence === 'weekly') return addDaysToKey(baseKey, index * 7);
    if (recurrence === 'monthly') {
      const first = new Date(base.getFullYear(), base.getMonth() + index, 1);
      const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      first.setDate(Math.min(base.getDate(), lastDay));
      return toDateKey(first);
    }
    if (recurrence === 'yearly') {
      const first = new Date(base.getFullYear() + index, base.getMonth(), 1);
      const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      first.setDate(Math.min(base.getDate(), lastDay));
      return toDateKey(first);
    }
    return baseKey;
  };

  const createId = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    if (typeof window.uid === 'function') return window.uid();
    return `${Date.now()}-${Math.random()}`;
  };

  const defaultUntil = (startKey) => occurrenceDate(startKey, 'yearly', 1);

  const recurrenceDescription = (recurrence, startKey) => {
    const date = parseDateKey(startKey);
    if (recurrence === 'weekly') return `매주 ${new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }).format(date)}`;
    if (recurrence === 'monthly') return `매월 ${date.getDate()}일`;
    if (recurrence === 'yearly') return `매년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
    return LABELS[recurrence] || LABELS.none;
  };

  const syncControls = ({ setDefault = false } = {}) => {
    const recurrence = RECURRENCES.has(recurrenceSelect.value) ? recurrenceSelect.value : 'none';
    const start = document.querySelector('#eventDate')?.value || '';
    untilField.hidden = recurrence === 'none';
    untilInput.required = recurrence !== 'none';
    untilInput.min = start;
    if (recurrence !== 'none' && start && (setDefault || !untilInput.value || untilInput.value < start)) {
      untilInput.value = defaultUntil(start);
    }
    summary.textContent = recurrence === 'none'
      ? '반복하지 않는 일정이에요.'
      : `${recurrenceDescription(recurrence, start)} · ${untilInput.value || '종료일 선택'}까지`;
  };

  const previousOpenEventDialog = window.openEventDialog;
  if (typeof previousOpenEventDialog === 'function' && !previousOpenEventDialog.__eventRecurrenceWrapped) {
    const wrapped = function (event = null) {
      const result = previousOpenEventDialog(event);
      recurrenceSelect.value = 'none';
      untilInput.value = '';
      syncControls();
      return result;
    };
    wrapped.__eventRecurrenceWrapped = true;
    window.openEventDialog = wrapped;
  }

  const generateOccurrences = (template, recurrence, recurrenceUntil) => {
    const duration = Math.max(0, dayDistanceBetween(template.date, template.endDate || template.date));
    const items = [];
    for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
      const date = occurrenceDate(template.date, recurrence, index);
      if (date > recurrenceUntil) break;
      items.push({
        ...template,
        id: index === 0 ? template.id : createId(),
        date,
        endDate: addDaysToKey(date, duration),
      });
    }
    const nextDate = occurrenceDate(template.date, recurrence, items.length);
    return { items, truncated: items.length === MAX_OCCURRENCES && nextDate <= recurrenceUntil };
  };

  const notificationStorageKey = () => {
    if (typeof state !== 'undefined' && state.session?.user?.id && state.household?.id) {
      return `family-notification-center-v1:${state.session.user.id}:${state.household.id}`;
    }
    return 'family-notification-center-v1:device';
  };

  const eventTimestamp = (item) => new Date(`${item.date}T${item.time || '09:00'}:00`).getTime();

  const toLocalDateTimeValue = (timestamp) => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}`;
  };

  const copyReminderSettings = (items, template) => {
    const presetField = document.querySelector('#eventReminderPreset');
    if (!presetField) return;
    const preset = presetField.value || 'none';
    const customValue = document.querySelector('#eventReminderCustomAt')?.value || '';
    const customTimestamp = customValue ? new Date(customValue).getTime() : NaN;
    const baseTimestamp = eventTimestamp(template);
    const customOffset = Number.isFinite(customTimestamp) ? customTimestamp - baseTimestamp : 0;
    const key = notificationStorageKey();
    let store;
    try { store = JSON.parse(localStorage.getItem(key) || 'null') || {}; }
    catch { store = {}; }
    store.eventReminders = store.eventReminders && typeof store.eventReminders === 'object' ? store.eventReminders : {};
    items.forEach((item) => {
      store.eventReminders[item.id] = {
        preset,
        customAt: preset === 'custom' ? toLocalDateTimeValue(eventTimestamp(item) + customOffset) : '',
        enabled: preset !== 'none',
      };
    });
    try {
      localStorage.setItem(key, JSON.stringify(store));
      window.dispatchEvent(new StorageEvent('storage', { key }));
    } catch { /* 일정 저장 자체는 유지 */ }
  };

  const saveRemote = async (items) => {
    if (!(typeof state !== 'undefined' && state.supabase && state.session)) return true;
    const { error } = await state.supabase.from('events').upsert(items.map((item) => window.toRemote(item)));
    if (!error) return true;
    if (typeof window.toast === 'function') {
      window.toast(error.message?.includes('event_end_date') ? 'Supabase 날짜 범위 업데이트가 필요해요' : '반복 일정을 저장하지 못했어요');
    }
    return false;
  };

  const commitToState = (items) => {
    items.forEach((item) => {
      const index = state.events.findIndex((event) => event.id === item.id);
      if (index >= 0) state.events[index] = item;
      else state.events.push(item);
    });
    if (!state.supabase) {
      try { localStorage.setItem('family-calendar-events-v1', JSON.stringify(state.events)); }
      catch { /* 현재 화면의 일정은 유지 */ }
    }
  };

  const setSaving = (next) => {
    saving = next;
    submitButton.disabled = next;
    submitButton.setAttribute('aria-busy', String(next));
    submitButton.textContent = next ? '저장 중…' : (document.querySelector('#eventId')?.value ? '변경사항 저장' : '일정 추가');
  };

  const saveRepeatedEvent = async (submitEvent) => {
    const recurrence = RECURRENCES.has(recurrenceSelect.value) ? recurrenceSelect.value : 'none';
    if (recurrence === 'none') return;
    submitEvent.preventDefault();
    submitEvent.stopImmediatePropagation();
    if (saving) return;
    if (state.supabase && !state.household) {
      document.querySelector('#eventDialog')?.close();
      if (typeof window.toast === 'function') window.toast('먼저 가족 공간을 만들어주세요');
      return;
    }

    const startDate = document.querySelector('#eventDate').value;
    const endDate = document.querySelector('#eventEndDate').value || startDate;
    const recurrenceUntil = untilInput.value;
    if (!recurrenceUntil || recurrenceUntil < startDate) {
      if (typeof window.toast === 'function') window.toast('반복 종료일은 시작일 이후로 선택해 주세요');
      return;
    }
    if (endDate < startDate) {
      if (typeof window.toast === 'function') window.toast('종료일은 시작일 이후로 선택해 주세요');
      return;
    }

    const template = {
      id: document.querySelector('#eventId').value || createId(),
      title: document.querySelector('#eventTitle').value.trim(),
      date: startDate,
      endDate,
      time: document.querySelector('#eventTime').value,
      member: document.querySelector('#eventMember').value,
      note: document.querySelector('#eventNote').value.trim(),
    };
    const { items, truncated } = generateOccurrences(template, recurrence, recurrenceUntil);
    if (truncated) {
      if (typeof window.toast === 'function') window.toast(`반복 일정은 한 번에 최대 ${MAX_OCCURRENCES}개까지 만들 수 있어요`);
      return;
    }
    if (!items.length) return;

    setSaving(true);
    try {
      if (!await saveRemote(items)) return;
      commitToState(items);
      copyReminderSettings(items, template);
      state.selectedDate = items[0].date;
      state.viewDate = new Date(parseDateKey(items[0].date).getFullYear(), parseDateKey(items[0].date).getMonth(), 1);
      document.querySelector('#eventDialog')?.close();
      if (typeof window.render === 'function') window.render();
      if (typeof window.toast === 'function') window.toast(`${items.length}개의 반복 일정을 추가했어요`);
    } finally {
      setSaving(false);
    }
  };

  recurrenceSelect.addEventListener('change', () => syncControls({ setDefault: true }));
  untilInput.addEventListener('change', syncControls);
  document.querySelector('#eventDate')?.addEventListener('change', () => syncControls());
  form.addEventListener('click', (event) => {
    if (event.target.closest('[data-date-shortcut]')) setTimeout(() => syncControls(), 0);
  });
  form.addEventListener('submit', saveRepeatedEvent, { capture: true });
})();
