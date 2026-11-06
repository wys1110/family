(() => {
  const svgNS = 'http://www.w3.org/2000/svg';
  const refresh = () => {
    const svg = document.querySelector('#carePatternContent .care-band-dial');
    if (!svg) return;
    let path = svg.querySelector('[data-live-sleep]');
    const timer = careTimer, now = Date.now();
    const valid = timer?.type === 'sleep' && timer.babyId === state.activeBabyId
      && state.babies.some(baby => baby.id === timer.babyId)
      && timer.contextKey === careTimerContextKey()
      && Number.isFinite(timer.startedAt) && timer.startedAt > 0 && timer.startedAt <= now
      && now - timer.startedAt < 86400000
      && (timer.endedAt == null || (Number.isFinite(timer.endedAt)
        && timer.endedAt >= timer.startedAt && timer.endedAt <= now));
    const day = parseDate(carePatternDate); day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day); nextDay.setDate(nextDay.getDate() + 1);
    const start = valid ? Math.max(timer.startedAt, day.getTime()) : 0;
    const end = valid ? Math.min(timer.endedAt ?? now, nextDay.getTime()) : 0;
    if (!valid || !Number.isFinite(start) || !Number.isFinite(end) || !carePatternCategories.has('sleep') || end <= start) {
      path?.remove();
      const label = svg.getAttribute('data-sleep-base-label');
      if (label != null) { svg.setAttribute('aria-label', label); svg.removeAttribute('data-sleep-base-label'); }
      return;
    }
    if (document.hidden || state.activeView !== 'growth') return;
    const began = new Date(start);
    const minutes = began.getHours() * 60 + began.getMinutes() + began.getSeconds() / 60 + began.getMilliseconds() / 60000;
    const duration = (end - start) / 60000;
    if (!path) {
      path = document.createElementNS(svgNS, 'path');
      path.setAttribute('class', 'care-band-range sleep');
      path.setAttribute('data-live-sleep', '');
      path.setAttribute('fill-rule', 'evenodd');
      path.setAttribute('pointer-events', 'none');
      svg.querySelector('.care-band-track').after(path);
    }
    path.setAttribute('data-start', minutes);
    path.setAttribute('data-duration', duration);
    path.setAttribute('d', careDurationSector(minutes, duration));
    const seconds = Math.floor((end - start) / 1000);
    const status = `${timer.endedAt == null ? '수면 중' : '수면 종료'} ${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
    path.setAttribute('aria-label', status);
    const baseLabel = svg.getAttribute('data-sleep-base-label') ?? svg.getAttribute('aria-label') ?? '';
    svg.setAttribute('data-sleep-base-label', baseLabel);
    svg.setAttribute('aria-label', `${baseLabel} ${status}.`);
  };
  for (const name of ['renderCareTimer', 'renderCarePattern']) {
    const original = name === 'renderCareTimer' ? renderCareTimer : renderCarePattern;
    const wrapped = Object.assign(function (...args) {
      const result = original.apply(this, args);
      refresh();
      return result;
    }, original);
    if (name === 'renderCareTimer') renderCareTimer = wrapped;
    else renderCarePattern = wrapped;
  }
  for (const event of ['familycontextchange', 'familybabychange', 'focus']) window.addEventListener(event, refresh);
  document.addEventListener('visibilitychange', refresh);
  setInterval(refresh, 1000);
  refresh();
})();
