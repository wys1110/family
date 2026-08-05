(() => {
  const FILTERS = new Set(['all', 'event', 'growth', 'todo']);

  const numeric = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  };

  const normalizeText = (value) => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ko-KR');

  const dateTimeKey = (item = {}) => `${String(item.date || item.dueDate || '9999-12-31')}T${String(item.time || '99:99')}`;

  const eventOccursOn = (event = {}, todayKey) => {
    const start = String(event.date || '');
    const end = String(event.endDate || event.end_date || event.date || '');
    return Boolean(todayKey && start && start <= todayKey && end >= todayKey);
  };

  const eventTitle = (event) => String(event?.title || '일정');

  const todaySummary = ({ events = [], growthEntries = [], todos = [], unreadNotifications = 0, todayKey } = {}) => {
    const currentEvents = (Array.isArray(events) ? events : []).filter((event) => eventOccursOn(event, todayKey));
    const upcomingEvents = (Array.isArray(events) ? events : [])
      .filter((event) => String(event?.date || '') >= String(todayKey || ''))
      .sort((left, right) => dateTimeKey(left).localeCompare(dateTimeKey(right), 'ko-KR'));
    const currentGrowth = (Array.isArray(growthEntries) ? growthEntries : []).filter((entry) => String(entry?.date || '') === String(todayKey || ''));
    const currentTodos = (Array.isArray(todos) ? todos : []).filter((todo) => String(todo?.dueDate || todo?.due_date || '') === String(todayKey || '') && !todo.completed);

    return {
      eventCount: currentEvents.length,
      nextEvent: upcomingEvents[0] ? {
        id: upcomingEvents[0].id,
        title: eventTitle(upcomingEvents[0]),
        date: upcomingEvents[0].date,
        time: upcomingEvents[0].time || '',
      } : null,
      todoCount: currentTodos.length,
      feedingMl: currentGrowth.filter((entry) => entry.category === '수유·이유식').reduce((sum, entry) => sum + numeric(entry.feedingMl), 0),
      feedingMinutes: currentGrowth.filter((entry) => entry.category === '수유·이유식').reduce((sum, entry) => sum + numeric(entry.feedingMinutes), 0),
      sleepMinutes: currentGrowth.filter((entry) => entry.category === '수면').reduce((sum, entry) => sum + numeric(entry.sleepMinutes), 0),
      diaperCount: currentGrowth.filter((entry) => entry.category === '기저귀').length,
      unreadNotifications: Math.max(0, Number(unreadNotifications) || 0),
    };
  };

  const recordMatches = (record, query) => {
    const needle = normalizeText(query);
    if (!needle) return true;
    return record.searchText.some((value) => normalizeText(value).includes(needle));
  };

  const toEventRecord = (event = {}) => ({
    type: 'event',
    id: String(event.id || ''),
    title: eventTitle(event),
    date: String(event.date || ''),
    subtitle: [event.member, event.time].filter(Boolean).join(' · '),
    source: 'event',
    searchText: [event.title, event.note, event.member, event.date, event.time],
  });

  const toGrowthRecord = (entry = {}) => ({
    type: 'growth',
    id: String(entry.id || ''),
    title: String(entry.title || entry.category || '성장 기록'),
    date: String(entry.date || ''),
    subtitle: [entry.category, entry.babyName].filter(Boolean).join(' · '),
    source: 'growth',
    searchText: [entry.title, entry.note, entry.category, entry.babyName, entry.date],
  });

  const toTodoRecord = (todo = {}) => ({
    type: 'todo',
    id: String(todo.id || ''),
    title: String(todo.title || '할 일'),
    date: String(todo.dueDate || todo.due_date || ''),
    subtitle: [todo.assignee, todo.completed ? '완료' : '미완료'].filter(Boolean).join(' · '),
    source: 'todo',
    searchText: [todo.title, todo.note, todo.assignee, todo.dueDate, todo.due_date],
  });

  const searchRecords = ({ events = [], growthEntries = [], todos = [], query = '', filter = 'all' } = {}) => {
    const selectedFilter = FILTERS.has(filter) ? filter : 'all';
    const records = [
      ...(Array.isArray(events) ? events.map(toEventRecord) : []),
      ...(Array.isArray(growthEntries) ? growthEntries.map(toGrowthRecord) : []),
      ...(Array.isArray(todos) ? todos.map(toTodoRecord) : []),
    ];
    return records
      .filter((record) => selectedFilter === 'all' || record.type === selectedFilter)
      .filter((record) => recordMatches(record, query))
      .sort((left, right) => `${right.date}T${right.title}`.localeCompare(`${left.date}T${left.title}`, 'ko-KR'))
      .map(({ searchText, ...record }) => record);
  };

  window.FAMILY_UTILITY_API = { todaySummary, searchRecords };
})();
