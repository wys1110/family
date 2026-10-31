(() => {
  const storageKey = 'family-sleep-pending-v1';
  let scope = '', generation = 0, rows = [], pending = null, busy = false, ready = false;
  let channel = null, client = null, readVersion = 0;
  const enabled = () => !window.FAMILY_DEMO_MODE && Boolean(state.supabase && state.session?.user?.id && state.household?.id);
  const key = () => enabled() ? `${state.session.user.id}:${state.household.id}` : '';
  const context = () => ({ key: key(), generation, client: state.supabase, user: state.session?.user?.id, home: state.household?.id });
  const current = ctx => ctx.key === key() && ctx.key === scope && ctx.generation === generation && ctx.client === state.supabase;
  const persist = () => {
    try {
      if (pending) localStorage.setItem(storageKey, JSON.stringify({ scope, ...pending }));
      else localStorage.removeItem(storageKey);
    } catch { /* The in-memory operation still keeps the same ID. */ }
  };
  const recover = (ctx, operation) => withAuthRecovery(operation, ctx.client, ctx.user, () => current(ctx));
  const mergeEntry = row => {
    if (!row) return;
    const entry = fromGrowthRemote(row);
    const index = state.growthEntries.findIndex(item => item.id === entry.id);
    if (index < 0) state.growthEntries.push(entry);
    else state.growthEntries[index] = entry;
  };
  const project = () => {
    if (!enabled() || key() !== scope) {
      if (careTimer?.sharedId) { careTimer = null; persistCareTimer(); }
      return;
    }
    // An existing local feeding timer or pre-upgrade finished record is retained.
    if (careTimer && !careTimer.sharedId && (careTimer.type !== 'sleep' || careTimer.endedAt)) return;
    if (!ready) return;
    const row = rows.find(item => item.baby_id === state.activeBabyId);
    if (row) {
      careTimer = { ...careTimerDefinition('sleep'), sharedId: row.id, babyId: row.baby_id,
        startedAt: Date.parse(row.started_at), contextKey: careTimerContextKey(),
        ...(pending?.action === 'stop' && pending.id === row.id ? { endedAt: pending.endedAt } : {}) };
    } else if (careTimer?.sharedId || !pending) careTimer = null;
    persistCareTimer();
  };
  const renderBase = renderCareTimer;
  renderCareTimer = Object.assign(function (...args) {
    project();
    const result = renderBase.apply(this, args);
    if (enabled()) {
      const disabled = busy || !ready;
      const compact = document.querySelector('[data-compact-sleep]');
      if (compact) {
        compact.disabled = compact.disabled || disabled;
        if (pending && !busy) compact.textContent = '다시 동기화';
      }
      if (careTimer?.type === 'sleep') {
        for (const selector of ['#careTimerStop', '#careTimerCancel']) {
          const button = document.querySelector(selector);
          if (button) button.disabled = disabled;
        }
      }
    }
    return result;
  }, renderBase);
  const render = () => { renderCareTimer(); renderTodayCareSummary(activeBabyEntries()); };

  async function refresh() {
    if (!enabled() || key() !== scope || busy) return;
    const ctx = context(), version = ++readVersion;
    try {
      const { data, error } = await recover(ctx, () => ctx.client.from('family_sleep_sessions').select('*')
        .eq('household_id', ctx.home).is('ended_at', null).is('cancelled_at', null));
      if (!current(ctx) || version !== readVersion) return;
      if (error) throw error;
      const next = data || [];
      const finished = rows.filter(row => !next.some(item => item.id === row.id)).map(row => row.id);
      if (finished.length) {
        const records = await recover(ctx, () => ctx.client.from('growth_entries').select('*').eq('household_id', ctx.home).in('id', finished));
        if (!current(ctx) || version !== readVersion) return;
        if (records.error) throw records.error;
        (records.data || []).forEach(mergeEntry);
      }
      rows = next; ready = true;
      render();
      if (finished.length) renderGrowth();
    } catch {
      if (current(ctx) && !ready) toast('가족 수면 상태에 연결하지 못했어요. 연결되면 다시 확인합니다');
    }
  }

  async function submit() {
    if (!pending || busy || !enabled() || key() !== scope) return;
    const ctx = context(), operation = { ...pending };
    busy = true; ++readVersion; render();
    try {
      const { data, error } = await recover(ctx, () => ctx.client.rpc('change_family_sleep', {
        p_household_id: ctx.home, p_baby_id: operation.babyId, p_session_id: operation.id,
        p_action: operation.action,
        p_started_at: operation.startedAt ? new Date(operation.startedAt).toISOString() : null,
        p_ended_at: operation.endedAt ? new Date(operation.endedAt).toISOString() : null,
      }));
      if (!current(ctx)) return;
      if (error) throw error;
      const row = data.session;
      rows = rows.filter(item => item.baby_id !== row.baby_id);
      if (!row.ended_at && !row.cancelled_at) rows.push(row);
      mergeEntry(data.entry);
      pending = null; persist(); ready = true;
      // Clear an imported local timer before projecting the server result.
      if (careTimer?.type === 'sleep' && careTimer.babyId === operation.babyId) careTimer = null;
      renderGrowth();
      if (operation.action === 'stop' && data.entry) {
        dispatchGrowthEntrySaved(fromGrowthRemote(data.entry));
        showGrowthComplete(`수면 ${formatDuration(data.entry.sleep_minutes)} 기록을 저장했어요.`);
      } else if (operation.action === 'start' && !row.ended_at && !row.cancelled_at) toast('가족에게 수면 시작을 공유했어요');
      else if (operation.action === 'cancel') toast('가족 수면 타이머를 취소했어요');
    } catch (error) {
      if (current(ctx)) {
        ready = true;
        if (['P0001', '42501'].includes(error.code)) {
          pending = null; persist();
          toast('수면을 저장하지 못했어요. 가족 연결과 수면 시간(24시간 이내)을 확인해 주세요');
        } else toast('가족 동기화를 확인하지 못했어요. 다시 동기화를 눌러주세요');
      }
    } finally {
      if (current(ctx)) { busy = false; render(); if (!pending) await refresh(); }
    }
  }
  function start() {
    if (busy || !ready) return;
    if (pending) return submit();
    if (careTimer) return toast('진행 중인 기록을 먼저 멈춰주세요');
    pending = { action: 'start', id: uid(), babyId: state.activeBabyId, startedAt: Date.now() };
    persist(); return submit();
  }
  function stop() {
    if (busy) return;
    if (pending) return submit();
    if (!careTimer?.sharedId) return;
    pending = { action: 'stop', id: careTimer.sharedId, babyId: careTimer.babyId, endedAt: Date.now() };
    persist(); return submit();
  }
  function cancel() {
    if (busy || !careTimer?.sharedId) return;
    if (pending) return submit();
    if (!window.confirm('가족에게 공유 중인 수면 타이머를 저장하지 않고 취소할까요?')) return;
    pending = { action: 'cancel', id: careTimer.sharedId, babyId: careTimer.babyId };
    persist(); return submit();
  }
  async function connect() {
    ++generation; ++readVersion;
    if (channel && client) client.removeChannel(channel);
    channel = null; client = state.supabase; scope = key(); rows = []; pending = null; busy = false; ready = false;
    if (!enabled()) { render(); return; }
    const ctx = context();
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved?.scope === scope && ['start','stop','cancel'].includes(saved.action)
        && state.babies.some(baby => baby.id === saved.babyId)) pending = saved;
    } catch { /* No recoverable operation. */ }
    // Share a running pre-upgrade timer without losing its original start time.
    if (!pending && careTimer?.type === 'sleep' && !careTimer.sharedId && !careTimer.endedAt
      && careTimer.contextKey === careTimerContextKey()) {
      pending = { action: 'start', id: uid(), babyId: careTimer.babyId, startedAt: careTimer.startedAt };
      persist();
    }
    channel = client.channel(`family-sleep:${ctx.home}:${generation}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_sleep_sessions', filter: `household_id=eq.${ctx.home}` }, () => { if (current(ctx)) refresh(); })
      .subscribe(status => { if (status === 'SUBSCRIBED' && current(ctx)) refresh(); });
    render();
    if (pending) await submit();
    else await refresh();
  }
  window.FAMILY_SLEEP = { enabled, start, stop, cancel, refresh, hasPending: () => Boolean(pending) };
  window.addEventListener('familycontextchange', connect);
  const resume = () => { if (document.hidden) return; if (pending) submit(); else refresh(); };
  window.addEventListener('online', resume);
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  setInterval(resume, 15000);
  connect();
})();
