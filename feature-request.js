(() => {
  if (document.querySelector('[data-feature-request-module]')) return;

  const VIEW_NAME = 'feature-request';
  const ACTIVE_VIEW_STORAGE_KEY = 'family-active-view-v1';
  const DRAFT_KEY = 'family-feature-request-draft-v1';
  const ISSUE_URL = 'https://github.com/wys1110/family/issues/new';
  const MAX_LENGTH = 500;

  const main = document.querySelector('.app-shell main');
  const navigation = document.querySelector('.view-tabs');
  if (!main || !navigation) return;

  let tab = navigation.querySelector(`[data-view="${VIEW_NAME}"]`);
  if (!tab) {
    tab = document.createElement('button');
    tab.className = 'view-tab';
    tab.dataset.view = VIEW_NAME;
    tab.type = 'button';
    tab.textContent = '기능 요청';
    navigation.appendChild(tab);
  }

  const view = document.createElement('div');
  view.id = 'featureRequestView';
  view.className = 'feature-request-view';
  view.dataset.featureRequestModule = '';
  view.hidden = true;
  view.innerHTML = `
    <section class="feature-request-card" aria-labelledby="featureRequestTitle">
      <div class="feature-request-heading">
        <span class="feature-request-mark" aria-hidden="true">✦</span>
        <div>
          <p class="eyebrow">FAMILY LAB</p>
          <h2 id="featureRequestTitle">필요한 기능 요청</h2>
          <span>불편한 점이나 새로 필요한 기능을 편하게 남겨주세요.</span>
        </div>
      </div>
      <form class="feature-request-form" id="featureRequestForm">
        <label for="featureRequestText">어떤 기능이 필요하세요?</label>
        <textarea id="featureRequestText" name="request" rows="4" maxlength="${MAX_LENGTH}" placeholder="예: 모유와 분유를 구분해서 하루 합계를 보고 싶어요." required></textarea>
        <div class="feature-request-actions">
          <span id="featureRequestCount" aria-live="polite">0/${MAX_LENGTH}</span>
          <button type="submit">요청 등록</button>
        </div>
        <p class="feature-request-note">등록을 누르면 내용이 입력된 GitHub 요청 페이지가 새 탭으로 열려요.</p>
      </form>
    </section>
  `;
  main.appendChild(view);

  const form = view.querySelector('#featureRequestForm');
  const textarea = view.querySelector('#featureRequestText');
  const count = view.querySelector('#featureRequestCount');

  const readDraft = () => {
    try { return localStorage.getItem(DRAFT_KEY) || ''; }
    catch { return ''; }
  };

  const saveDraft = (value) => {
    try {
      if (value) localStorage.setItem(DRAFT_KEY, value);
      else localStorage.removeItem(DRAFT_KEY);
    } catch { /* 브라우저 저장이 막혀도 입력은 계속 허용 */ }
  };

  const updateCount = () => {
    count.textContent = `${textarea.value.length}/${MAX_LENGTH}`;
  };

  const installFeatureRequestView = () => {
    if (typeof switchView !== 'function') return false;
    if (switchView.__featureRequestInstalled) return true;

    const previousSwitchView = switchView;
    const enhancedSwitchView = function (requestedView) {
      const featureView = document.querySelector('#featureRequestView');
      const addButton = document.querySelector('#addEventButton');

      if (requestedView !== VIEW_NAME) {
        if (featureView) featureView.hidden = true;
        return previousSwitchView(requestedView);
      }

      previousSwitchView('calendar');
      if (typeof state !== 'undefined') state.activeView = VIEW_NAME;
      try { localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, VIEW_NAME); } catch { /* 현재 화면만 유지 */ }

      ['calendarView', 'growthView', 'englishView', 'privateView'].forEach((id) => {
        const target = document.getElementById(id);
        if (target) target.hidden = true;
      });
      if (featureView) featureView.hidden = false;
      document.querySelectorAll('.view-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.view === VIEW_NAME);
      });
      if (addButton) addButton.hidden = true;
    };

    enhancedSwitchView.__featureRequestInstalled = true;
    enhancedSwitchView.__englishStoriesInstalled = previousSwitchView.__englishStoriesInstalled;
    switchView = enhancedSwitchView;
    return true;
  };

  const restoreFeatureRequestView = (attempt = 0) => {
    if (!installFeatureRequestView()) {
      if (attempt < 40) setTimeout(() => restoreFeatureRequestView(attempt + 1), 100);
      return;
    }
    let savedView = null;
    try { savedView = localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY); } catch { /* 기본 탭 유지 */ }
    if (savedView === VIEW_NAME) switchView(VIEW_NAME);
  };

  textarea.value = readDraft();
  updateCount();

  textarea.addEventListener('input', () => {
    updateCount();
    saveDraft(textarea.value);
  });

  tab.addEventListener('click', () => {
    if (typeof switchView === 'function') switchView(VIEW_NAME);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const request = textarea.value.trim();
    if (!request) {
      textarea.focus();
      return;
    }

    const summary = request.replace(/\s+/g, ' ').slice(0, 44);
    const body = [
      '## 요청 내용',
      request,
      '',
      '## 요청 위치',
      '기능 요청 탭',
      '',
      '---',
      '가족 웹의 기능 요청 탭에서 작성됨',
    ].join('\n');
    const url = `${ISSUE_URL}?title=${encodeURIComponent(`[기능 요청] ${summary}`)}&body=${encodeURIComponent(body)}`;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  });

  restoreFeatureRequestView();
})();