(() => {
  if (window.__familyCalendarSwipeInstalled) return;
  window.__familyCalendarSwipeInstalled = true;

  const SWIPE_RATIO = 0.18;
  const MIN_DISTANCE = 44;
  const FLING_VELOCITY = 0.45;
  const SNAP_DURATION = 140;
  const MONTH_DURATION = 190;
  const EASING = "cubic-bezier(.22,.72,.16,1)";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let gesture = null;
  let animating = false;
  const runningAnimations = new Set();

  const calendarGrid = () => document.querySelector("#calendarGrid");
  const nativeMonthPicker = () => document.querySelector("#nativeMonthPicker");

  function clearGridMotion(grid = calendarGrid()) {
    if (!grid) return;
    grid.classList.remove("calendar-swipe-tracking");
    grid.style.removeProperty("transform");
    grid.style.removeProperty("will-change");
  }

  function cancelRunningAnimations() {
    runningAnimations.forEach((animation) => animation.cancel());
    runningAnimations.clear();
    document.querySelectorAll(".calendar-swipe-stage").forEach((stage) => stage.remove());
    clearGridMotion();
  }

  function animateX(element, from, to, duration) {
    element.style.transform = `translate3d(${from}px, 0, 0)`;
    if (reduceMotion.matches || typeof element.animate !== "function") {
      element.style.transform = `translate3d(${to}px, 0, 0)`;
      return Promise.resolve();
    }

    const animation = element.animate(
      [
        { transform: `translate3d(${from}px, 0, 0)` },
        { transform: `translate3d(${to}px, 0, 0)` },
      ],
      { duration, easing: EASING, fill: "forwards" },
    );
    runningAnimations.add(animation);
    return animation.finished
      .catch(() => undefined)
      .finally(() => {
        runningAnimations.delete(animation);
        animation.cancel();
        element.style.transform = `translate3d(${to}px, 0, 0)`;
      });
  }

  function createOutgoingStage(grid, startX) {
    const rect = grid.getBoundingClientRect();
    const stage = document.createElement("div");
    stage.className = "calendar-swipe-stage";
    Object.assign(stage.style, {
      left: `${rect.left - startX}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });

    const outgoing = grid.cloneNode(true);
    outgoing.removeAttribute("id");
    outgoing.setAttribute("aria-hidden", "true");
    outgoing.style.transform = `translate3d(${startX}px, 0, 0)`;
    stage.appendChild(outgoing);
    document.body.appendChild(stage);
    return { stage, outgoing, width: rect.width };
  }

  async function transitionMonth(delta, startX = 0) {
    if (animating) return;
    const grid = calendarGrid();
    if (!grid) return;

    if (runningAnimations.size) cancelRunningAnimations();
    animating = true;
    monthSwipeAnimating = true;
    lastCalendarTap = { date: null, at: 0 };
    suppressCalendarClickUntil = Date.now() + 500;

    const { stage, outgoing, width } = createOutgoingStage(grid, startX);
    const outgoingTarget = -delta * width;
    const incomingStart = delta * width;
    const remaining = Math.max(0.28, 1 - Math.min(1, Math.abs(startX) / Math.max(width, 1)));
    const duration = Math.round(MONTH_DURATION * remaining);

    try {
      clearGridMotion(grid);
      changeMonth(delta);
      const incoming = calendarGrid();
      incoming.style.willChange = "transform";
      incoming.style.transform = `translate3d(${incomingStart}px, 0, 0)`;
      incoming.getBoundingClientRect();

      await Promise.all([
        animateX(outgoing, startX, outgoingTarget, duration),
        animateX(incoming, incomingStart, 0, duration),
      ]);
    } finally {
      stage.remove();
      clearGridMotion();
      monthSwipeAnimating = false;
      animating = false;
    }
  }

  async function snapBack(grid, fromX) {
    grid.style.willChange = "transform";
    await animateX(grid, fromX, 0, SNAP_DURATION);
    clearGridMotion(grid);
  }

  function beginSwipe(event) {
    const grid = calendarGrid();
    if (!grid || event.currentTarget !== grid) return;
    event.stopImmediatePropagation();
    if (animating || (event.pointerType === "mouse" && event.button !== 0)) return;

    cancelRunningAnimations();
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastAt: performance.now(),
      velocityX: 0,
      displayX: 0,
      axis: null,
    };
    grid.setPointerCapture?.(event.pointerId);
  }

  function moveSwipe(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const grid = calendarGrid();
    if (!grid) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return;
      gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.08 ? "x" : "y";
      if (gesture.axis === "y") {
        gesture = null;
        clearGridMotion(grid);
        return;
      }
      grid.classList.add("calendar-swipe-tracking");
      grid.style.willChange = "transform";
    }

    if (gesture.axis !== "x") return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const width = Math.max(grid.clientWidth, 1);
    const limit = width * 0.72;
    const displayX = Math.sign(dx) * (Math.abs(dx) > limit ? limit + (Math.abs(dx) - limit) * 0.16 : Math.abs(dx));
    grid.style.transform = `translate3d(${displayX}px, 0, 0)`;
    gesture.displayX = displayX;

    const now = performance.now();
    const elapsed = now - gesture.lastAt;
    if (elapsed >= 12) {
      gesture.velocityX = (event.clientX - gesture.lastX) / elapsed;
      gesture.lastX = event.clientX;
      gesture.lastAt = now;
    }
  }

  function finishSwipe(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.stopImmediatePropagation();

    const grid = calendarGrid();
    const current = gesture;
    gesture = null;
    if (!grid || current.axis !== "x") {
      clearGridMotion(grid);
      return;
    }

    const dx = event.clientX - current.startX;
    const width = Math.max(grid.clientWidth, 1);
    const threshold = Math.max(MIN_DISTANCE, width * SWIPE_RATIO);
    const shouldChange = Math.abs(dx) >= threshold || Math.abs(current.velocityX) >= FLING_VELOCITY;

    suppressCalendarClickUntil = Date.now() + 500;
    lastCalendarTap = { date: null, at: 0 };
    if (!shouldChange) {
      snapBack(grid, current.displayX);
      return;
    }

    const delta = dx < 0 ? 1 : -1;
    transitionMonth(delta, current.displayX);
  }

  function cancelSwipe(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.stopImmediatePropagation();
    const grid = calendarGrid();
    const fromX = gesture.displayX;
    gesture = null;
    if (grid && fromX) snapBack(grid, fromX);
    else clearGridMotion(grid);
  }

  function monthValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function syncMonthPickerTrigger() {
    const label = document.querySelector("#monthLabel");
    const input = nativeMonthPicker();
    if (!label || !input) return;

    const text = label.textContent.trim() || "월 선택";
    input.setAttribute("aria-label", `${text}. 이동할 연도와 월 선택`);
    if (document.activeElement !== input) input.value = monthValue(state.viewDate);
  }

  function selectMonth(year, month, preferredDay = parseDate(state.selectedDate).getDate()) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    state.viewDate = new Date(year, month, 1);
    state.selectedDate = dateKey(new Date(year, month, Math.min(preferredDay, lastDay)));
    lastCalendarTap = { date: null, at: 0 };
    renderCalendar();
    renderAgenda();
    syncMonthPickerTrigger();
  }

  function installMonthPicker() {
    const heading = document.querySelector("#monthLabel");
    if (!heading || nativeMonthPicker()) return;

    const trigger = document.createElement("label");
    trigger.className = "month-picker-trigger";

    const label = document.createElement("span");
    label.id = "monthLabel";
    label.textContent = heading.textContent;

    const input = document.createElement("input");
    input.id = "nativeMonthPicker";
    input.className = "month-picker-native-input";
    input.type = "month";
    input.value = monthValue(state.viewDate);
    input.autocomplete = "off";

    input.addEventListener("change", () => {
      const match = /^(\d{4})-(\d{2})$/.exec(input.value);
      if (!match) return;
      selectMonth(Number(match[1]), Number(match[2]) - 1);
    });

    trigger.append(label, input);
    heading.replaceWith(trigger);

    new MutationObserver(syncMonthPickerTrigger).observe(label, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    syncMonthPickerTrigger();
  }

  function install() {
    const grid = calendarGrid();
    if (!grid || grid.dataset.smoothSwipe === "true") return;
    grid.dataset.smoothSwipe = "true";
    grid.addEventListener("pointerdown", beginSwipe, { capture: true });
    grid.addEventListener("pointermove", moveSwipe, { capture: true, passive: false });
    grid.addEventListener("pointerup", finishSwipe, { capture: true });
    grid.addEventListener("pointercancel", cancelSwipe, { capture: true });

    slideMonth = (delta) => transitionMonth(delta, 0);
    installMonthPicker();
  }

  install();
})();
