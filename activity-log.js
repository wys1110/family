(() => {
  if (document.documentElement.dataset.activityLogModule === 'ready') return;
  document.documentElement.dataset.activityLogModule = 'ready';
  if (window.FAMILY_DEMO?.active) return;

  // Keep the disclosure implementation available for a future product decision,
  // but do not expose it in the current settings surface.
  const SHOW_ACTIVITY_DISCLOSURE = false;
  const SESSION_KEY_PREFIX = 'family-activity-session-v1';
  const VIEW_FEATURES = new Set(['calendar', 'growth', 'english', 'feature-request', 'settings', 'admin']);
  const recent = new Map();
  let hiddenAt = 0;

  const getContext = () => {
    if (typeof state === 'undefined' || !state.supabase || !state.session?.user?.id) return null;
    return {
      supabase: state.supabase,
      userId: state.session.user.id,
      householdId: state.household?.id || null,
    };
  };

  const waitForContext = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const context = getContext();
      if (context) return context;
      if (typeof state !== 'undefined' && state.authReady && !state.session) return null;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };

  const logActivity = async (activityType, featureName) => {
    const context = await waitForContext();
    if (!context) return false;
    const type = String(activityType || '').trim().slice(0, 32);
    const feature = String(featureName || '').trim().slice(0, 40);
    if (!type || !feature) return false;

    const dedupeKey = `${context.userId}:${type}:${feature}`;
    const now = Date.now();
    if (now - (recent.get(dedupeKey) || 0) < 20000) return false;
    recent.set(dedupeKey, now);

    try {
      const { error } = await context.supabase.rpc('log_app_activity', {
        p_activity_type: type,
        p_feature_name: feature,
        p_household_id: context.householdId,
      });
      if (error) throw error;
      return true;
    } catch (error) {
      recent.delete(dedupeKey);
      const missingMigration = error?.code === '42883' || /log_app_activity|schema cache/i.test(error?.message || '');
      if (!missingMigration) console.warn('최근 활동 기록 실패', error);
      return false;
    }
  };

  window.FAMILY_ACTIVITY_LOG = logActivity;

  const logSessionOpen = async () => {
    const context = await waitForContext();
    if (!context) return;
    const sessionKey = `${SESSION_KEY_PREFIX}:${context.userId}:${context.householdId || 'none'}`;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
    } catch { /* sessionStorage가 막혀도 기록 시도 */ }

    const saved = await logActivity('session_open', 'app');
    if (!saved) return;
    try { sessionStorage.setItem(sessionKey, new Date().toISOString()); }
    catch { /* 현재 세션의 중복 방지는 서버에서도 수행 */ }
  };

  const installDisclosure = (attempt = 0) => {
    const settingsView = document.querySelector('#settingsView');
    if (!settingsView) {
      if (attempt < 60) setTimeout(() => installDisclosure(attempt + 1), 100);
      return;
    }
    if (settingsView.querySelector('[data-activity-disclosure]')) return;
    const notice = document.createElement('section');
    notice.className = 'settings-card activity-disclosure-card';
    notice.dataset.activityDisclosure = '';
    notice.innerHTML = `
      <div class="settings-heading">
        <span class="settings-mark" aria-hidden="true">◷</span>
        <div>
          <p class="eyebrow">서비스 운영 기록</p>
          <h2>최근 활동 기록</h2>
          <span>앱 실행, 화면 이동, 성장 기록 저장 시각만 운영 목적으로 보관합니다.</span>
        </div>
      </div>
      <p class="activity-disclosure-copy">일정 제목, 성장 수치, 메모, 사진 같은 실제 내용은 활동 기록에 저장하지 않으며 기록은 90일 후 삭제됩니다.</p>`;
    settingsView.appendChild(notice);

    if (!document.querySelector('style[data-activity-disclosure-style]')) {
      const style = document.createElement('style');
      style.dataset.activityDisclosureStyle = '';
      style.textContent = `
        .activity-disclosure-copy { margin: 0; color: var(--secondary); font-size: 10px; line-height: 1.6; }
      `;
      document.head.appendChild(style);
    }
  };

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('.view-tab[data-view]');
    if (!tab || tab.hidden || !VIEW_FEATURES.has(tab.dataset.view)) return;
    logActivity('view_open', tab.dataset.view);
  }, true);

  window.addEventListener('family:growth-entry-saved', () => {
    logActivity('record_saved', 'growth');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt >= 30 * 60 * 1000) logActivity('session_resume', 'app');
    hiddenAt = 0;
  });

  window.addEventListener('familycontextchange', logSessionOpen);
  setTimeout(logSessionOpen, 1200);
  if (SHOW_ACTIVITY_DISCLOSURE) installDisclosure();
})();
