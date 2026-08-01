(() => {
  if (window.__familyCalendarFontSettingsInstalled) return;
  window.__familyCalendarFontSettingsInstalled = true;

  const STORAGE_KEY = 'family-calendar-font-size-v1';
  const MIN_SIZE = 6;
  const MAX_SIZE = 14;
  const DEFAULT_SIZE = 8;
  const LEGACY_SIZES = Object.freeze({ small: 7, medium: 8, large: 9 });

  const normalizeSize = (value) => {
    const legacySize = LEGACY_SIZES[value];
    const parsed = legacySize || Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_SIZE;
    return Math.min(MAX_SIZE, Math.max(MIN_SIZE, parsed));
  };

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

      .calendar-font-slider-control {
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr) 24px;
        gap: 12px;
        align-items: center;
      }

      .calendar-font-size-mark {
        color: var(--secondary);
        font-size: 15px;
        font-weight: 750;
        line-height: 1;
        text-align: center;
        user-select: none;
      }

      .calendar-font-size-mark.large {
        font-size: 24px;
      }

      .calendar-font-slider-wrap {
        --calendar-font-ratio: .25;
        --calendar-font-progress: 25%;
        position: relative;
        display: flex;
        align-items: center;
        min-width: 0;
        height: 52px;
      }

      .calendar-font-slider-input {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 44px;
        margin: 0;
        padding: 0;
        border: 0;
        outline: 0;
        background: transparent;
        appearance: none;
        -webkit-appearance: none;
        cursor: pointer;
        touch-action: pan-y;
      }

      .calendar-font-slider-input::-webkit-slider-runnable-track {
        height: 6px;
        border-radius: 999px;
        background: linear-gradient(
          to right,
          var(--blue) 0,
          var(--blue) var(--calendar-font-progress),
          rgba(var(--theme-accent-rgb), .22) var(--calendar-font-progress),
          rgba(var(--theme-accent-rgb), .22) 100%
        );
        box-shadow: inset 0 1px 1px rgba(0, 0, 0, .08);
      }

      .calendar-font-slider-input::-moz-range-track {
        height: 6px;
        border-radius: 999px;
        background: rgba(var(--theme-accent-rgb), .22);
        box-shadow: inset 0 1px 1px rgba(0, 0, 0, .08);
      }

      .calendar-font-slider-input::-moz-range-progress {
        height: 6px;
        border-radius: 999px;
        background: var(--blue);
      }

      .calendar-font-slider-input::-webkit-slider-thumb {
        width: 42px;
        height: 42px;
        margin-top: -18px;
        border: 0;
        border-radius: 50%;
        background: transparent;
        box-shadow: none;
        appearance: none;
        -webkit-appearance: none;
      }

      .calendar-font-slider-input::-moz-range-thumb {
        width: 42px;
        height: 42px;
        border: 0;
        border-radius: 50%;
        background: transparent;
        box-shadow: none;
      }

      .calendar-font-slider-input:focus-visible {
        border-radius: 999px;
        box-shadow: 0 0 0 3px rgba(var(--theme-accent-rgb), .16);
      }

      .calendar-font-slider-value {
        position: absolute;
        z-index: 2;
        top: 50%;
        left: calc(21px + (100% - 42px) * var(--calendar-font-ratio));
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        transform: translate(-50%, -50%);
        border: 3px solid rgba(255, 255, 255, .92);
        border-radius: 50%;
        color: #fff;
        background: var(--blue);
        box-shadow:
          0 5px 16px rgba(var(--theme-accent-rgb), .32),
          inset 0 1px 0 rgba(255, 255, 255, .24);
        font-size: 16px;
        font-weight: 820;
        font-variant-numeric: tabular-nums;
        line-height: 1;
        pointer-events: none;
      }

      .calendar-font-scale-labels {
        display: flex;
        justify-content: space-between;
        margin: -2px 36px 0;
        color: var(--secondary);
        font-size: 10px;
        font-weight: 650;
        font-variant-numeric: tabular-nums;
        line-height: 1.3;
      }

      @media (min-width: 768px) {
        .calendar-font-slider-control {
          grid-template-columns: 28px minmax(0, 1fr) 28px;
          gap: 16px;
        }

        .calendar-font-slider-wrap { height: 58px; }
        .calendar-font-slider-input { height: 50px; }
        .calendar-font-size-mark { font-size: 17px; }
        .calendar-font-size-mark.large { font-size: 27px; }
        .calendar-font-scale-labels { margin-inline: 44px; font-size: 11px; }
      }
    `;
    document.head.appendChild(style);
  };

  const updateControls = (size) => {
    const normalized = normalizeSize(size);
    const input = document.querySelector('[data-calendar-font-input]');
    if (input) {
      input.value = String(normalized);
      input.setAttribute('aria-valuetext', `${normalized}px`);
    }

    const value = document.querySelector('[data-calendar-font-value]');
    if (value) value.textContent = String(normalized);

    const ratio = (normalized - MIN_SIZE) / (MAX_SIZE - MIN_SIZE);
    const sliderWrap = document.querySelector('[data-calendar-font-slider]');
    if (sliderWrap) {
      sliderWrap.style.setProperty('--calendar-font-ratio', String(ratio));
      sliderWrap.style.setProperty('--calendar-font-progress', `${ratio * 100}%`);
    }
  };

  const applySize = (value, { persist = true, announce = false } = {}) => {
    const size = normalizeSize(value);
    document.documentElement.dataset.calendarFontSize = String(size);
    document.documentElement.style.setProperty('--calendar-event-user-font-size', `${size}px`);
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, String(size)); } catch { /* 현재 화면에는 적용 */ }
    }
    updateControls(size);
    window.dispatchEvent(new CustomEvent('familycalendarfontchange', { detail: { size, pixels: size } }));
    if (announce && typeof toast === 'function') toast(`캘린더 일정 글자를 ${size}px로 표시해요 🔤`);
    return size;
  };

  const installSettingsCard = () => {
    const view = document.querySelector('#settingsView');
    if (!view) return false;
    if (view.querySelector('[data-calendar-font-card]')) {
      updateControls(normalizeSize(document.documentElement.dataset.calendarFontSize));
      return true;
    }

    const card = document.createElement('section');
    card.className = 'settings-card';
    card.dataset.calendarFontCard = '';
    card.setAttribute('aria-labelledby', 'calendarFontSettingsTitle');
    card.innerHTML = `
      <div class="settings-heading">
        <span class="settings-mark" aria-hidden="true">Aa</span>
        <div>
          <p class="eyebrow">CALENDAR</p>
          <h2 id="calendarFontSettingsTitle">일정 글자 크기</h2>
          <span>캘린더 안 일정 제목의 크기를 조절해요.</span>
        </div>
      </div>
      <div class="calendar-font-slider-control">
        <span class="calendar-font-size-mark" aria-hidden="true">A</span>
        <label class="calendar-font-slider-wrap" data-calendar-font-slider>
          <span class="sr-only">일정 글자 크기</span>
          <input
            class="calendar-font-slider-input"
            type="range"
            min="${MIN_SIZE}"
            max="${MAX_SIZE}"
            step="1"
            data-calendar-font-input
            aria-describedby="calendarFontRangeNote"
          >
          <output class="calendar-font-slider-value" data-calendar-font-value aria-hidden="true"></output>
        </label>
        <span class="calendar-font-size-mark large" aria-hidden="true">A</span>
      </div>
      <div class="calendar-font-scale-labels" id="calendarFontRangeNote">
        <span>${MIN_SIZE}px</span><span>${MAX_SIZE}px</span>
      </div>
      <div class="theme-save-note calendar-font-save-note">
        <span aria-hidden="true">✓</span>
        <p><strong>크기는 자동 저장돼요</strong><small>다음 방문에도 그대로 적용됩니다.</small></p>
      </div>
    `;
    view.appendChild(card);

    const input = card.querySelector('[data-calendar-font-input]');
    input.addEventListener('input', () => applySize(input.value));
    input.addEventListener('change', () => applySize(input.value, { announce: true }));

    updateControls(normalizeSize(document.documentElement.dataset.calendarFontSize));
    return true;
  };

  const install = (attempt = 0) => {
    if (installSettingsCard()) return;
    if (attempt < 50) setTimeout(() => install(attempt + 1), 100);
  };

  installStyles();
  applySize(storedSize(), { persist: false });
  install();
})();
