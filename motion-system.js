(() => {
  if (window.FAMILY_MOTION_API) return;

  const VIEW_ORDER = ['calendar', 'growth', 'english', 'feature-request', 'settings', 'admin'];
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let wrappedSwitchView = null;
  let activeTransition = null;
  let transitionId = 0;
  let transitionUpdateDepth = 0;

  const currentView = () => document.querySelector('.view-tab.active[data-view]')?.dataset.view || '';

  const directionBetween = (from, to) => {
    if (!from || !to || from === to) return 'none';
    const fromIndex = VIEW_ORDER.indexOf(from);
    const toIndex = VIEW_ORDER.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return 'forward';
    return toIndex > fromIndex ? 'forward' : 'backward';
  };

  const clearDirection = (id) => {
    if (id !== transitionId) return;
    delete document.documentElement.dataset.familyMotionDirection;
    activeTransition = null;
  };

  const runUpdate = (update) => {
    transitionUpdateDepth += 1;
    try {
      return update();
    } finally {
      transitionUpdateDepth -= 1;
    }
  };

  const transitionView = (requestedView, update, options = {}) => {
    if (transitionUpdateDepth > 0) return update();
    const from = options.currentView ?? currentView();
    const direction = directionBetween(from, requestedView);
    if (direction === 'none') {
      activeTransition?.skipTransition?.();
      transitionId += 1;
      activeTransition = null;
      delete document.documentElement.dataset.familyMotionDirection;
      runUpdate(update);
      return null;
    }
    if (typeof document.startViewTransition !== 'function') {
      runUpdate(update);
      return null;
    }

    activeTransition?.skipTransition?.();
    const id = ++transitionId;
    document.documentElement.dataset.familyMotionDirection = direction;

    try {
      activeTransition = document.startViewTransition(() => {
        if (id !== transitionId) return;
        return runUpdate(update);
      });
      Promise.resolve(activeTransition.finished)
        .catch(() => {})
        .finally(() => {
          clearDirection(id);
        });
      return activeTransition;
    } catch (error) {
      console.warn('화면 전환 모션을 건너뛰었어요', error);
      runUpdate(update);
      clearDirection(id);
      return null;
    }
  };

  const copyFunctionProperties = (source, target) => {
    Object.keys(source).forEach((key) => {
      try { target[key] = source[key]; } catch { /* 읽기 전용 속성은 유지 */ }
    });
  };

  const ensureWrapped = () => {
    const latest = window.switchView;
    if (typeof latest !== 'function') return false;
    if (latest === wrappedSwitchView && latest.__familyMotionWrapped) return true;

    const original = latest;
    const wrapped = function familyMotionSwitchView(requestedView) {
      return transitionView(requestedView, () => original(requestedView), { currentView: currentView() });
    };
    copyFunctionProperties(original, wrapped);
    wrapped.__familyMotionWrapped = true;
    wrapped.__familyMotionOriginal = original;
    wrappedSwitchView = wrapped;
    window.switchView = wrapped;
    return true;
  };

  const activate = () => ensureWrapped();

  const markSaved = (target) => {
    if (!target?.classList) return;
    target.classList.remove('family-motion-saved');
    void target.offsetWidth;
    target.classList.add('family-motion-saved');
    window.setTimeout(() => target.classList.remove('family-motion-saved'), reduceMotion?.matches ? 80 : 760);
  };

  window.FAMILY_MOTION_API = Object.freeze({
    directionBetween,
    transitionView,
    markSaved,
    ensureWrapped,
    activate,
  });

  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('.view-tab[data-view]')) ensureWrapped();
  }, true);
})();
