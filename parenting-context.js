(() => {
  const day = date => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date);
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const number = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const sum = (items, field) => Math.round(items.reduce((total, item) => total + (number(item[field]) ? item[field] : 0), 0) * 10) / 10;
  const stamp = entry => /^\d{2}:\d{2}$/.test(entry.time || '') && Number(entry.time.slice(0, 2)) < 24 && Number(entry.time.slice(3)) < 60 ? Date.parse(`${entry.date}T${entry.time}:00+09:00`) : null;
  const when = entry => entry ? `${entry.date} ${stamp(entry) === null ? '(시간 미기록)' : entry.time}` : '기록 없음';
  function summarize(state, babyId, now = new Date()) {
    const baby = state?.babies?.find(item => item.id === babyId && !item.archivedAt);
    if (!baby) return '선택된 아이가 없어요. 성장 탭에서 아이를 등록해 주세요.';
    const today = day(now);
    const age = validDate(baby.birthDate) ? Math.round((Date.parse(today) - Date.parse(baby.birthDate)) / 86400000) : null;
    const entries = (state.growthEntries || []).filter(entry => entry.babyId === baby.id && validDate(entry.date) && entry.date <= today && (stamp(entry) === null || stamp(entry) <= now.getTime())).sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`));
    const lines = [`기준: ${today} (한국 시간)`, age === null ? '생후 일수: 생일 미기록' : age < 0 ? `출생 예정일 ${-age}일 전` : `생후 ${age}일 경과 · 태어난 지 ${age + 1}일째`];
    for (const [field, label, unit] of [['weight', '몸무게', 'kg'], ['height', '키', 'cm'], ['head', '머리둘레', 'cm']]) {
      const latest = entries.find(entry => number(entry[field]));
      const old = latest && Math.round((Date.parse(today) - Date.parse(latest.date)) / 86400000);
      lines.push(latest ? `${label}: ${latest[field]}${unit} · ${latest.date} 측정${old ? ` (${old}일 전)` : ''}` : `${label}: 측정 기록 없음`);
    }
    const weights = entries.filter(entry => number(entry.weight)).slice(0, 3);
    if (weights.length > 1) lines.push(`최근 몸무게: ${weights.reverse().map(entry => `${entry.date} ${entry.weight}kg`).join(' → ')}`);
    const start = day(new Date(Date.parse(`${today}T12:00:00+09:00`) - 6 * 86400000));
    const recent = entries.filter(entry => entry.date >= start);
    const feeding = recent.filter(entry => ['formula', 'pumped', 'breast'].includes(growthCareType(entry)));
    const poo = recent.filter(entry => entry.category === '기저귀' && ['대변', '소변·대변'].includes(entry.diaperKind));
    lines.push(`최근 수유: ${when(feeding[0])}`, `최근 대변: ${when(poo[0])} (최근 7일 내 기록)`);
    const timed = feeding.filter(entry => stamp(entry) !== null);
    if (timed.length >= 2) lines.push(`최근 두 수유 기록 간격: ${Math.round((stamp(timed[0]) - stamp(timed[1])) / 60000)}분 (중간 기록 누락 가능)`);
    const sleepEntries = window.FAMILY_DATA?.splitSleepEntries ? window.FAMILY_DATA.splitSleepEntries(recent) : recent;
    lines.push('최근 7일 기록 요약 (없는 기록은 실제 0회라는 뜻이 아님):');
    for (let offset = 0; offset < 7; offset++) {
      const date = day(new Date(Date.parse(`${today}T12:00:00+09:00`) - offset * 86400000));
      const items = recent.filter(entry => entry.date === date);
      if (!items.length) { lines.push(`${date}: 기록 없음`); continue; }
      const feeds = feeding.filter(entry => entry.date === date), breast = feeds.filter(entry => growthCareType(entry) === 'breast');
      const bottle = feeds.filter(entry => ['formula', 'pumped'].includes(growthCareType(entry)));
      const diapers = items.filter(entry => entry.category === '기저귀');
      const sleeps = sleepEntries.filter(entry => entry.date === date && entry.category === '수면');
      lines.push(`${date}${date === today ? ' 오늘 진행 중' : ''}: 수유 기록 ${feeds.length}회, 분유·유축 ${sum(bottle, 'feedingMl')}mL (양 미기록 ${bottle.filter(entry => !number(entry.feedingMl)).length}회), 직수 ${breast.length}회·${sum(breast, 'feedingMinutes')}분 (시간 미기록 ${breast.filter(entry => !number(entry.feedingMinutes)).length}회), 대변 ${diapers.filter(entry => ['대변', '소변·대변'].includes(entry.diaperKind)).length}회, 소변 ${diapers.filter(entry => ['소변', '소변·대변'].includes(entry.diaperKind)).length}회, 수면 ${sum(sleeps, 'sleepMinutes')}분 (${sleeps.length}개 기록)`);
    }
    lines.push('직수 시간은 섭취량(mL)이 아님. 대변 색·상태, 진단, 투약, 메모, 사진은 포함하지 않음. 필요한 정보는 사용자에게 확인할 것.');
    return lines.join('\n');
  }
  window.FAMILY_PARENTING_CONTEXT = { summarize };
})();
