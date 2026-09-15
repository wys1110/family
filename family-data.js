(() => {
  // Always request the next page, even when a project caps rows below our page size.
  const readAll = async (query, { pageSize = 500, isCurrent = () => true, onProgress = () => {} } = {}) => {
    const rows = []; const seen = new Set();
    for (let offset = 0; ; ) {
      if (!isCurrent()) return { data: null, error: new Error('가족 공간이 변경됐어요.') };
      const { data, error } = await query().order('id').range(offset, offset + pageSize - 1);
      if (error) return { data: null, error };
      if (!isCurrent()) return { data: null, error: new Error('가족 공간이 변경됐어요.') };
      if (!Array.isArray(data)) return { data: null, error: new Error('기록 응답을 확인할 수 없어요.') };
      if (!data.length) return { data: rows, error: null };
      let added = 0;
      for (const row of data) {
        if (row.id == null) return { data: null, error: new Error('기록 ID가 없어요.') };
        if (!seen.has(row.id)) { seen.add(row.id); rows.push(row); added++; }
      }
      if (!added) return { data: null, error: new Error('기록 목록이 변경됐어요. 다시 시도해 주세요.') };
      offset += data.length;
      onProgress(rows.length);
    }
  };
  // Display-only segments retain their source ID so editing opens the original record.
  const splitSleepEntries = entries => entries.flatMap(entry => {
    if (entry.category !== '수면') return [entry];
    const minutes = Number(entry.sleepMinutes);
    if (entry.sleepMinutes == null || entry.sleepMinutes === '' || !Number.isFinite(minutes) || minutes < 0 || minutes > 10080) return [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date || '')) return [];
    const day = new Date(`${entry.date}T12:00:00`);
    if (!Number.isFinite(day.getTime()) || day.getFullYear() !== Number(entry.date.slice(0,4)) || day.getMonth()+1 !== Number(entry.date.slice(5,7)) || day.getDate() !== Number(entry.date.slice(8,10))) return [];
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time || '') || minutes === 0) return [entry];
    let start = new Date(`${entry.date}T${entry.time}:00`);
    if (!Number.isFinite(start.getTime())) return [];
    const end = new Date(start.getTime() + minutes * 60000), result = [];
    while (start < end) {
      const next = new Date(start); next.setHours(24, 0, 0, 0);
      const stop = new Date(Math.min(next.getTime(), end.getTime()));
      const date = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
      const time = `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`;
      result.push({ ...entry, date, time, sleepMinutes: (stop - start) / 60000 });
      start = stop;
    }
    return result;
  });
  window.FAMILY_DATA = { readAll, splitSleepEntries };
})();
