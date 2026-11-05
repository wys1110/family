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
    const baby = state.babies.find(item => item.id === careTimer?.babyId);
    const active = !window.FAMILY_DEMO_MODE && baby && careTimer?.type === 'sleep'
      && !careTimer.endedAt && careTimer.contextKey === careTimerContextKey()
      && Number.isFinite(careTimer.startedAt) && careTimer.startedAt <= Date.now();
    desired = active ? {
      sessionId: careTimer.sharedId || `${careTimer.babyId}:${careTimer.startedAt}`,
      babyName: baby.name || '아기', startedAt: careTimer.startedAt,
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
