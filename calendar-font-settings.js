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

      .calendar-font-number-control {
        display: grid;
        grid-template-columns: 52px minmax(0, 1fr) 52px;
        gap: 10px;
        align-items: center;
      }

      .calendar-font-step-button,
      .calendar-font-number-wrap {
        min-height: 54px;
        border: 1px solid var(--separator);
        border-radius: 17px;
        background: var(--surface);
      }

      .calendar-font-step-button {
        display: grid;
        place-items: center;
        padding: 0;
        color: var(--blue);
        font: inherit;
        font-size: 28px;
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        transition: transform .16s ease, border-color .16s ease, background .16s ease;
      }

      .calendar-font-step-button:active {
        transform: scale(.95);
        background: rgba(var(--theme-accent-rgb), .08);
      }

      .calendar-font-step-button:disabled {
        opacity: .38;
        cursor: default;
      }

      .calendar-font-number-wrap {
        position: relative;
        display: flex;
        align-items: center;
        overflow: hidden;
        border-color: rgba(var(--theme-accent-rgb), .52);
        background: rgba(var(--theme-accent-rgb), .055);
        box-shadow: 0 8px 22px rgba(var(--theme-accent-rgb), .09);
      }

      .calendar-font-number-input {
        width: 100%;
        min-width: 0;
        height: 52px;
        padding: 0 45px 0 18px;
        border: 0;
        outline: 0;
        color: var(--label);
        background: transparent;
        font: inherit;
        font-size: 20px;
        font-weight: 800;
        line-height: 1;
        text-align: center;
        appearance: textfield;
      }

      .calendar-font-number-input::-webkit-inner-spin-button,
      .calendar-font-number-input::-webkit-outer-spin-button {
        margin: 0;
        appearance: none;
      }

      .calendar-font-number-input:focus-visible {
        box-shadow: inset 0 0 0 2px rgba(var(--theme-accent-rgb), .45);
      }

      .calendar-font-number-unit {
        position: absolute;
        right: 16px;
        color: var(--secondary);
        font-size: 12px;
        font-weight: 750;
        pointer-events: none;
      }

      .calendar-font-preview {
        display: grid;
        place-items: center;
        min-height: 66px;
        margin-top: 10px;
        padding: 10px 14px;
        border: 1px solid var(--separator);
        border-radius: 17px;
        background: var(--surface);
      }

      .calendar-font-preview span {
        max-width: 100%;
        overflow: hidden;
        color: var(--blue);
        font-size: var(--calendar-event-user-font-size);
        font-weight: 800;
        line-height: 1.25;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .calendar-font-range-note {
        display: block;
        margin: 8px 2px 0;
        color: var(--secondary);
        font-size: 10px;
        line-height: 1.4;
        text-align: center;
      }

      @media (min-width: 768px) {
        .calendar-font-number-control {
          grid-template-columns: 58px minmax(0, 1fr) 58px;
          gap: 12px;
        }

        .calendar-font-step-button,
        .calendar-font-number-wrap { min-height: 58px; }
        .calendar-font-number-input { height: 56px; font-size: 22px; }
        .calendar-font-preview { min-height: 74px; }
        .calendar-font-range-note { font-size: 11px; }
      }
    `;
    document.head.appendChild(style);
  };

  const updateControls = (size) => {
    const normalized = normalizeSize(size);
    const input = document.querySelector('[data-calendar-font-input]');
    if (input && document.activeElement !== input) input.value = String(normalized);

    const current = document.querySelector('[data-calendar-font-current]');
    if (current) current.textContent = `현재 · ${normalized}px`;

    const decrease = document.querySelector('[data-calendar-font-step="-1"]');
    const increase = document.querySelector('[data-calendar-font-step="1"]');
    if (decrease) decrease.disabled = normalized <= MIN_SIZE;
    if (increase) increase.disabled = normalized >= MAX_SIZE;
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
          <span>캘린더 안 일정 제목의 크기를 숫자로 조절해요.</span>
        </div>
        <span class="settings-current-theme" data-calendar-font-current aria-live="polite"></span>
      </div>
      <div class="calendar-font-number-control" aria-label="캘린더 일정 글자 크기 입력">
        <button class="calendar-font-step-button" type="button" data-calendar-font-step="-1" aria-label="글자 크기 1픽셀 줄이기">−</button>
        <label class="calendar-font-number-wrap">
          <span class="sr-only">일정 글자 크기</span>
          <input class="calendar-font-number-input" type="number" inputmode="numeric" min="${MIN_SIZE}" max="${MAX_SIZE}" step="1" data-calendar-font-input aria-describedby="calendarFontRangeNote">
          <span class="calendar-font-number-unit" aria-hidden="true">px</span>
        </label>
        <button class="calendar-font-step-button" type="button" data-calendar-font-step="1" aria-label="글자 크기 1픽셀 키우기">＋</button>
      </div>
      <div class="calendar-font-preview" aria-hidden="true"><span>일정 제목 미리보기</span></div>
      <small class="calendar-font-range-note" id="calendarFontRangeNote">${MIN_SIZE}~${MAX_SIZE}px · 1px 단위</small>
      <div class="theme-save-note">
        <span aria-hidden="true">✓</span>
        <p><strong>입력한 크기는 자동 저장돼요</strong><small>이 기기에서 다음 방문에도 그대로 적용됩니다.</small></p>
      </div>
    `;
    view.appendChild(card);

    const input = card.querySelector('[data-calendar-font-input]');
    input.addEventListener('input', () => {
      if (input.value === '') return;
      const parsed = Number.parseInt(input.value, 10);
      if (!Number.isFinite(parsed) || parsed < MIN_SIZE || parsed > MAX_SIZE) return;
      applySize(parsed);
    });
    input.addEventListener('change', () => {
      const size = applySize(input.value, { announce: true });
      input.value = String(size);
    });
    input.addEventListener('blur', () => {
      input.value = String(applySize(input.value));
    });

    card.addEventListener('click', (event) => {
      const button = event.target.closest('[data-calendar-font-step]');
      if (!button) return;
      const current = normalizeSize(document.documentElement.dataset.calendarFontSize);
      const size = applySize(current + Number(button.dataset.calendarFontStep), { announce: true });
      input.value = String(size);
    });

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
