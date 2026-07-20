(() => {
  if (window.__familyCalendarFontSettingsInstalled) return;
  window.__familyCalendarFontSettingsInstalled = true;

  const STORAGE_KEY = 'family-calendar-font-size-v1';
  const DEFAULT_SIZE = 'medium';
  const OPTIONS = [
    { id: 'small', name: '작게', description: '제목을 더 많이 표시', sample: '7px' },
    { id: 'medium', name: '보통', description: '현재 크기', sample: '9px' },
    { id: 'large', name: '크게', description: '읽기 편하게', sample: '11px' },
  ];

  const validSize = (value) => OPTIONS.some((option) => option.id === value) ? value : DEFAULT_SIZE;
  const storedSize = () => {
    try { return validSize(localStorage.getItem(STORAGE_KEY)); }
    catch { return DEFAULT_SIZE; }
  };

  const installStyles = () => {
    if (document.querySelector('style[data-calendar-font-settings]')) return;
    const style = document.createElement('style');
    style.dataset.calendarFontSettings = '';
    style.textContent = `
      :root { --calendar-event-user-font-size: 8px; }
      html[data-calendar-font-size="small"] { --calendar-event-user-font-size: 7px; }
      html[data-calendar-font-size="medium"] { --calendar-event-user-font-size: 8px; }
      html[data-calendar-font-size="large"] { --calendar-event-user-font-size: 9px; }

      #calendarView .calendar-event-bar,
      #calendarView .calendar-overflow-badge {
        font-size: var(--calendar-event-user-font-size) !important;
      }

      .calendar-font-option-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .calendar-font-option {
        display: grid;
        gap: 7px;
        min-width: 0;
        min-height: 88px;
        padding: 12px 7px 10px;
        border: 1px solid var(--separator);
        border-radius: 17px;
        color: var(--label);
        background: var(--surface);
        text-align: center;
        cursor: pointer;
        transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease, background .16s ease;
      }

      .calendar-font-option:active { transform: scale(.975); }

      .calendar-font-option.active {
        border-color: rgba(var(--theme-accent-rgb), .55);
        background: rgba(var(--theme-accent-rgb), .065);
        box-shadow: 0 8px 22px rgba(var(--theme-accent-rgb), .11);
      }

      .calendar-font-sample {
        display: grid;
        place-items: center;
        min-height: 24px;
        color: var(--blue);
        font-size: var(--sample-size);
        font-weight: 750;
        line-height: 1;
        white-space: nowrap;
      }

      .calendar-font-option strong,
      .calendar-font-option small { display: block; }

      .calendar-font-option strong {
        font-size: 12px;
        font-weight: 750;
      }

      .calendar-font-option small {
        overflow: hidden;
        color: var(--secondary);
        font-size: 8px;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      @media (min-width: 700px) and (max-width: 767.98px) {
        :root { --calendar-event-user-font-size: 9px; }
        html[data-calendar-font-size="small"] { --calendar-event-user-font-size: 8px; }
        html[data-calendar-font-size="medium"] { --calendar-event-user-font-size: 9px; }
        html[data-calendar-font-size="large"] { --calendar-event-user-font-size: 10px; }
      }

      @media (min-width: 768px) {
        :root { --calendar-event-user-font-size: 11px; }
        html[data-calendar-font-size="small"] { --calendar-event-user-font-size: 10px; }
        html[data-calendar-font-size="medium"] { --calendar-event-user-font-size: 11px; }
        html[data-calendar-font-size="large"] { --calendar-event-user-font-size: 12px; }

        .calendar-font-option { min-height: 98px; }
        .calendar-font-option strong { font-size: 13px; }
        .calendar-font-option small { font-size: 9px; }
      }
    `;
    document.head.appendChild(style);
  };

  const updateControls = (sizeId) => {
    const selected = OPTIONS.find((option) => option.id === sizeId) || OPTIONS[1];
    document.querySelectorAll('[data-calendar-font-option]').forEach((button) => {
      const active = button.dataset.calendarFontOption === selected.id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
    const current = document.querySelector('[data-calendar-font-current]');
    if (current) current.textContent = `현재 · ${selected.name}`;
  };

  const applySize = (sizeId, { persist = true, announce = false } = {}) => {
    const selectedId = validSize(sizeId);
    const selected = OPTIONS.find((option) => option.id === selectedId) || OPTIONS[1];
    document.documentElement.dataset.calendarFontSize = selected.id;
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, selected.id); } catch { /* 현재 화면에는 적용 */ }
    }
    updateControls(selected.id);
    window.dispatchEvent(new CustomEvent('familycalendarfontchange', { detail: { size: selected.id } }));
    if (announce && typeof toast === 'function') toast(`캘린더 일정 글자를 ${selected.name} 표시해요 🔤`);
  };

  const installSettingsCard = () => {
    const view = document.querySelector('#settingsView');
    if (!view) return false;
    if (view.querySelector('[data-calendar-font-card]')) {
      updateControls(validSize(document.documentElement.dataset.calendarFontSize));
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
        <span class="settings-current-theme" data-calendar-font-current aria-live="polite"></span>
      </div>
      <div class="calendar-font-option-grid" role="radiogroup" aria-label="캘린더 일정 글자 크기 선택">
        ${OPTIONS.map((option) => `
          <button class="calendar-font-option" type="button" data-calendar-font-option="${option.id}" role="radio" aria-checked="false">
            <span class="calendar-font-sample" style="--sample-size:${option.sample}" aria-hidden="true">일정 제목</span>
            <span><strong>${option.name}</strong><small>${option.description}</small></span>
          </button>
        `).join('')}
      </div>
      <div class="theme-save-note">
        <span aria-hidden="true">✓</span>
        <p><strong>선택한 크기는 자동 저장돼요</strong><small>이 기기에서 다음 방문에도 그대로 적용됩니다.</small></p>
      </div>
    `;
    view.appendChild(card);

    card.addEventListener('click', (event) => {
      const option = event.target.closest('[data-calendar-font-option]');
      if (!option) return;
      applySize(option.dataset.calendarFontOption, { announce: true });
    });

    updateControls(validSize(document.documentElement.dataset.calendarFontSize));
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
