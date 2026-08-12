(() => {
  if (window.FAMILY_MOTION_API) return;

  const VIEW_ORDER = ['calendar', 'growth', 'english', 'feature-request', 'settings', 'admin'];
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let wrappedSwitchView = null;
  let activeTransition = null;
  let transitionId = 0;
  let entranceTimer = 0;

  const currentView = () => document.querySelector('.view-tab.active[data-view]')?.dataset.view || '';

  const directionBetween = (from, to) => {
    if (!from || !to || from === to) return 'none';
    const fromIndex = VIEW_ORDER.indexOf(from);
    const toIndex = VIEW_ORDER.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return 'forward';
    return toIndex > fromIndex ? 'forward' : 'backward';
  };

  const activeView = () => document.querySelector('main > [id$="View"]:not([hidden])');

  const animateEntrance = () => {
    const view = activeView();
    if (!view || reduceMotion?.matches) return;
    window.clearTimeout(entranceTimer);
    view.classList.remove('family-motion-entering');
    void view.offsetWidth;
    view.classList.add('family-motion-entering');
    entranceTimer = window.setTimeout(() => view.classList.remove('family-motion-entering'), 720);
  };

  const clearDirection = (id) => {
    if (id !== transitionId) return;
    delete document.documentElement.dataset.familyMotionDirection;
    activeTransition = null;
  };

  const transitionView = (requestedView, update, options = {}) => {
    const from = options.currentView ?? currentView();
    const direction = directionBetween(from, requestedView);
    if (direction === 'none' || reduceMotion?.matches || typeof document.startViewTransition !== 'function') {
      update();
      if (direction !== 'none') animateEntrance();
      return null;
    }

    activeTransition?.skipTransition?.();
    const id = ++transitionId;
    document.documentElement.dataset.familyMotionDirection = direction;

    try {
      activeTransition = document.startViewTransition(() => update());
      Promise.resolve(activeTransition.finished)
        .catch(() => {})
        .finally(() => {
          clearDirection(id);
          animateEntrance();
        });
      return activeTransition;
    } catch (error) {
      console.warn('화면 전환 모션을 건너뛰었어요', error);
      update();
      clearDirection(id);
      animateEntrance();
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
  });

  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('.view-tab[data-view]')) ensureWrapped();
  }, true);
  window.addEventListener?.('family:core-ready', ensureWrapped);
  if (document.readyState !== 'loading') ensureWrapped();
  else document.addEventListener('DOMContentLoaded', ensureWrapped, { once: true });
})();
