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
  window.FAMILY_DATA = { readAll };
})();
