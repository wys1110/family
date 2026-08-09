(() => {
  if (window.__familyCalendarFontSettingsInstalled) return;
  window.__familyCalendarFontSettingsInstalled = true;

  const STORAGE_KEY = 'family-calendar-font-size-v1';
  const SIZE_OPTIONS = Object.freeze([
    { id: 'small', label: '작게', size: 8 },
    { id: 'medium', label: '보통', size: 11 },
    { id: 'large', label: '크게', size: 14 },
  ]);
  const DEFAULT_SIZE = 11;

  const optionFor = (value) => {
    const byId = SIZE_OPTIONS.find((option) => option.id === value);
    if (byId) return byId;
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return SIZE_OPTIONS[1];
    return SIZE_OPTIONS.reduce((nearest, option) => (
      Math.abs(option.size - parsed) < Math.abs(nearest.size - parsed) ? option : nearest
    ));
  };

  const normalizeSize = (value) => optionFor(value).size;

  const storedSize = () => {
    try { return normalizeSize(localStorage.getItem(STORAGE_KEY)); }
    catch { return DEFAULT_SIZE; }
  };

  const installStyles = () => {
    if (document.querySelector('style[data-calendar-font-settings]')) return;
    const style = document.createElement('style');
    style.dataset.calendarFontSettings = '';
    style.textContent = `
      :root { --calendar-event-user-font-size: ${DEFAULT_SIZE}px; }

      #calendarView .calendar-event-bar,
      #calendarView .calendar-overflow-badge {
        font-size: var(--calendar-event-user-font-size) !important;
      }

      .calendar-font-toolbar {
        position: relative;
        z-index: 4;
      }

      .calendar-font-trigger {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        min-height: 32px;
        padding: 6px 9px;
        border: 1px solid var(--separator);
        border-radius: 9px;
        color: var(--secondary);
        background: var(--surface-2);
        font: inherit;
        font-size: 10px;
        font-weight: 760;
        cursor: pointer;
      }

      .calendar-font-trigger:active { transform: scale(.97); }
      .calendar-font-trigger:focus-visible {
        outline: 3px solid rgba(var(--theme-accent-rgb), .28);
        outline-offset: 2px;
      }

      .calendar-font-trigger-icon {
        color: var(--label);
        font-size: 12px;
        letter-spacing: -.12em;
        line-height: 1;
      }

      .calendar-font-trigger-current { color: var(--label); }
      .calendar-font-trigger-chevron { color: var(--tertiary); font-size: 11px; }

      .calendar-font-panel {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        width: min(228px, calc(100vw - 36px));
        padding: 12px;
        border: 1px solid var(--separator);
        border-radius: 16px;
        background: var(--surface);
        box-shadow: var(--theme-shadow);
      }

      .calendar-font-panel[hidden] { display: none !important; }
      .calendar-font-panel-heading { display: grid; gap: 3px; margin-bottom: 9px; }
      .calendar-font-panel-heading strong { color: var(--label); font-size: 12px; }
      .calendar-font-panel-heading small { color: var(--secondary); font-size: 10px; }

      .calendar-font-preset-control {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }

      .calendar-font-preset {
        display: grid;
        place-items: center;
        gap: 4px;
        min-width: 0;
        min-height: 52px;
        padding: 7px 5px;
        border: 1px solid var(--separator);
        border-radius: 12px;
        color: var(--secondary);
        background: var(--surface);
        font: inherit;
        cursor: pointer;
        transition: transform .16s ease, border-color .16s ease, background .16s ease;
      }

      .calendar-font-preset > span {
        display: grid;
        place-items: center;
        min-height: 18px;
        color: var(--label);
        font-size: var(--preset-preview-size);
        font-weight: 800;
        line-height: 1;
      }

      .calendar-font-preset > strong {
        font-size: 10px;
        font-weight: 760;
        line-height: 1;
      }

      .calendar-font-preset.active {
        border-color: rgba(var(--theme-accent-rgb), .58);
        color: var(--blue);
        background: rgba(var(--theme-accent-rgb), .1);
        box-shadow: 0 8px 20px rgba(var(--theme-accent-rgb), .1);
      }

      .calendar-font-preset:focus-visible {
        outline: 3px solid rgba(var(--theme-accent-rgb), .28);
        outline-offset: 2px;
      }

      .calendar-font-save-note {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 9px 2px 0;
        color: var(--secondary);
        font-size: 9px;
      }

      .calendar-font-save-note span { color: var(--green); font-size: 12px; }

      @media (min-width: 768px) {
        .calendar-font-panel { width: 244px; }
      }
    `;
    document.head.appendChild(style);
  };

  const updateControls = (value) => {
    const selected = optionFor(value);
    document.querySelectorAll('[data-calendar-font-preset]').forEach((button) => {
      const active = button.dataset.calendarFontPreset === selected.id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
    document.querySelectorAll('[data-calendar-font-current]').forEach((current) => {
      current.textContent = selected.label;
    });
  };

  const closePanel = () => {
    document.querySelectorAll('[data-calendar-font-panel]').forEach((panel) => { panel.hidden = true; });
    document.querySelectorAll('[data-calendar-font-trigger]').forEach((trigger) => {
      trigger.setAttribute('aria-expanded', 'false');
    });
  };

  const applySize = (value, { persist = true, announce = false } = {}) => {
    const selected = optionFor(value);
    const size = selected.size;
    document.documentElement.dataset.calendarFontSize = String(size);
    document.documentElement.style.setProperty('--calendar-event-user-font-size', `${size}px`);
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, String(size)); } catch { /* 현재 화면에는 적용 */ }
    }
    updateControls(size);
    window.dispatchEvent(new CustomEvent('familycalendarfontchange', { detail: { size, pixels: size } }));
    if (announce && typeof toast === 'function') toast(`일정 글자를 ${selected.label} 크기로 표시해요 🔤`);
    return size;
  };

  const installToolbarControl = () => {
    const toolbar = document.querySelector('#calendarView .calendar-toolbar');
    if (!toolbar) return false;
    if (toolbar.querySelector('[data-calendar-font-toolbar]')) {
      updateControls(document.documentElement.dataset.calendarFontSize);
      return true;
    }

    const control = document.createElement('div');
    control.className = 'calendar-font-toolbar';
    control.dataset.calendarFontToolbar = '';
    control.innerHTML = `
      <button class="calendar-font-trigger" type="button" data-calendar-font-trigger
        aria-label="일정 글자 크기" aria-controls="calendarFontPanel" aria-expanded="false">
        <span class="calendar-font-trigger-icon" aria-hidden="true">Aa</span>
        <span class="calendar-font-trigger-current" data-calendar-font-current>보통</span>
        <span class="calendar-font-trigger-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="calendar-font-panel" id="calendarFontPanel" data-calendar-font-panel
        role="dialog" aria-label="일정 글자 크기" hidden>
        <div class="calendar-font-panel-heading">
          <strong>일정 글자 크기</strong>
          <small>캘린더 일정 제목에 적용돼요</small>
        </div>
        <div class="calendar-font-preset-control" role="radiogroup" aria-label="캘린더 일정 글자 크기">
          ${SIZE_OPTIONS.map((option, index) => `
            <button class="calendar-font-preset" type="button" role="radio" aria-checked="false"
              data-calendar-font-preset="${option.id}" style="--preset-preview-size:${11 + index * 3}px">
              <span aria-hidden="true">가</span><strong>${option.label}</strong>
            </button>
          `).join('')}
        </div>
        <div class="calendar-font-save-note"><span aria-hidden="true">✓</span><span>이 기기에 자동 저장돼요</span></div>
      </div>
    `;
    toolbar.appendChild(control);

    control.querySelector('[data-calendar-font-trigger]').addEventListener('click', () => {
      const panel = control.querySelector('[data-calendar-font-panel]');
      const trigger = control.querySelector('[data-calendar-font-trigger]');
      const open = panel.hidden;
      closePanel();
      panel.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
    });

    control.addEventListener('click', (event) => {
      const button = event.target.closest('[data-calendar-font-preset]');
      if (!button) return;
      applySize(button.dataset.calendarFontPreset, { announce: true });
      closePanel();
    });

    document.addEventListener('click', (event) => {
      if (!control.contains(event.target)) closePanel();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closePanel();
    });

    updateControls(document.documentElement.dataset.calendarFontSize);
    return true;
  };

  const install = (attempt = 0) => {
    if (installToolbarControl()) return;
    if (attempt < 50) setTimeout(() => install(attempt + 1), 100);
  };

  installStyles();
  applySize(storedSize(), { persist: false });
  install();
})();
