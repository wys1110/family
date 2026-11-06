(() => {
  const capacitor = window.Capacitor;
  if (capacitor?.getPlatform?.() !== 'ios') return;
  const plugin = capacitor.registerPlugin?.('SleepLiveActivity') || capacitor.Plugins?.SleepLiveActivity;
  if (!plugin?.sync) return;

  let desired = {}, applied = '', running = false;
  const flush = async () => {
    if (running) return;
    running = true;
    try {
      while (JSON.stringify(desired) !== applied) {
        const snapshot = desired;
        const result = await plugin.sync(snapshot);
        if (!result.applied) break;
        applied = JSON.stringify(snapshot);
      }
    } catch { /* Retry the current state on the next render or foreground event. */ }
    finally { running = false; }
  };
  const sync = () => {
    const now = Date.now();
    const baby = state.babies.find(item => item.id === careTimer?.babyId);
    const valid = !window.FAMILY_DEMO_MODE && baby && careTimer?.type === 'sleep'
      && careTimer.contextKey === careTimerContextKey()
      && Number.isFinite(careTimer.startedAt) && careTimer.startedAt > 0 && careTimer.startedAt <= now
      && (careTimer.endedAt == null || (Number.isFinite(careTimer.endedAt)
        && careTimer.endedAt >= careTimer.startedAt && careTimer.endedAt <= now));
    desired = valid ? {
      sessionId: careTimer.sharedId || `${careTimer.babyId}:${careTimer.startedAt}`,
      babyName: baby.name || '아기', startedAt: careTimer.startedAt,
      ...(careTimer.endedAt == null ? {} : { endedAt: careTimer.endedAt }),
    } : {};
    void flush();
  };
  const previousRender = renderCareTimer;
  renderCareTimer = Object.assign(function (...args) {
    const result = previousRender.apply(this, args);
    sync();
    return result;
  }, previousRender);
  window.addEventListener('familycontextchange', () => { desired = {}; void flush(); });
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  sync();
})();
