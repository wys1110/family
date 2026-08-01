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
  let pickerYear = new Date().getFullYear();
  const runningAnimations = new Set();

  const calendarGrid = () => document.querySelector("#calendarGrid");
  const monthPickerDialog = () => document.querySelector("#monthPickerDialog");

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

  function syncMonthPickerTriggerLabel() {
    const trigger = document.querySelector("#monthLabel");
    if (!trigger) return;
    const label = trigger.textContent.trim() || "월 선택";
    trigger.setAttribute("aria-label", `${label}. 다른 월 선택`);
  }

  function createMonthPickerDialog() {
    const existing = monthPickerDialog();
    if (existing) return existing;

    const dialog = document.createElement("dialog");
    dialog.id = "monthPickerDialog";
    dialog.className = "month-picker-dialog";
    dialog.setAttribute("aria-labelledby", "monthPickerTitle");
    dialog.innerHTML = `
      <div class="month-picker-panel">
        <div class="month-picker-handle" aria-hidden="true"></div>
        <div class="month-picker-header">
          <div><p>달력 이동</p><h2 id="monthPickerTitle">월 선택</h2></div>
          <button type="button" class="month-picker-close" data-month-picker-close aria-label="닫기">×</button>
        </div>
        <div class="month-picker-year-nav" aria-label="연도 선택">
          <button type="button" data-month-picker-year="-1" aria-label="이전 연도">‹</button>
          <strong id="monthPickerYear" aria-live="polite"></strong>
          <button type="button" data-month-picker-year="1" aria-label="다음 연도">›</button>
        </div>
        <div class="month-picker-grid" id="monthPickerGrid" role="group" aria-label="월 선택"></div>
        <div class="month-picker-actions">
          <button type="button" class="month-picker-current" data-month-picker-current>이번 달</button>
          <button type="button" class="month-picker-cancel" data-month-picker-close>취소</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelectorAll("[data-month-picker-close]").forEach((button) => {
      button.addEventListener("click", () => dialog.close());
    });
    dialog.querySelectorAll("[data-month-picker-year]").forEach((button) => {
      button.addEventListener("click", () => {
        pickerYear += Number(button.dataset.monthPickerYear);
        renderMonthPicker();
      });
    });
    dialog.querySelector("[data-month-picker-current]").addEventListener("click", () => {
      const today = new Date();
      selectMonth(today.getFullYear(), today.getMonth(), today.getDate());
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    return dialog;
  }

  function renderMonthPicker() {
    const dialog = createMonthPickerDialog();
    const yearLabel = dialog.querySelector("#monthPickerYear");
    const grid = dialog.querySelector("#monthPickerGrid");
    const today = new Date();
    const viewedYear = state.viewDate.getFullYear();
    const viewedMonth = state.viewDate.getMonth();

    yearLabel.textContent = `${pickerYear}년`;
    grid.innerHTML = Array.from({ length: 12 }, (_, month) => {
      const selected = pickerYear === viewedYear && month === viewedMonth;
      const current = pickerYear === today.getFullYear() && month === today.getMonth();
      const note = selected ? "선택됨" : current ? "이번 달" : "";
      return `<button type="button" data-month-picker-month="${month}" class="${selected ? "selected" : ""} ${current ? "current" : ""}" aria-pressed="${selected}"><strong>${month + 1}월</strong><small>${note}</small></button>`;
    }).join("");

    grid.querySelectorAll("[data-month-picker-month]").forEach((button) => {
      button.addEventListener("click", () => selectMonth(pickerYear, Number(button.dataset.monthPickerMonth)));
    });
  }

  function selectMonth(year, month, preferredDay = parseDate(state.selectedDate).getDate()) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    state.viewDate = new Date(year, month, 1);
    state.selectedDate = dateKey(new Date(year, month, Math.min(preferredDay, lastDay)));
    lastCalendarTap = { date: null, at: 0 };
    renderCalendar();
    renderAgenda();
    monthPickerDialog()?.close();
  }

  function openMonthPicker() {
    const dialog = createMonthPickerDialog();
    pickerYear = state.viewDate.getFullYear();
    renderMonthPicker();
    syncMonthPickerTriggerLabel();
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => {
      const preferred = dialog.querySelector(".month-picker-grid .selected")
        || dialog.querySelector(".month-picker-grid button");
      preferred?.focus();
    });
  }

  function installMonthPicker() {
    const heading = document.querySelector("#monthLabel");
    if (!heading || heading.dataset.monthPickerInstalled === "true") return;

    let trigger = heading;
    if (heading.tagName !== "BUTTON") {
      trigger = document.createElement("button");
      trigger.id = heading.id;
      trigger.type = "button";
      trigger.className = "month-picker-trigger";
      trigger.textContent = heading.textContent;
      heading.replaceWith(trigger);
    } else {
      trigger.classList.add("month-picker-trigger");
      trigger.type = "button";
    }

    trigger.dataset.monthPickerInstalled = "true";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-controls", "monthPickerDialog");
    trigger.addEventListener("click", openMonthPicker);
    new MutationObserver(syncMonthPickerTriggerLabel).observe(trigger, { childList: true, characterData: true, subtree: true });
    syncMonthPickerTriggerLabel();
    createMonthPickerDialog();
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
