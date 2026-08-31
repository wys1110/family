(() => {
  const FILTERS = new Set(['all', 'event', 'growth', 'todo']);

  const normalizeText = (value) => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ko-KR');

  const eventTitle = (event) => String(event?.title || '일정');

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

  window.FAMILY_UTILITY_API = { searchRecords };
})();
