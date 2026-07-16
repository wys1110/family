(() => {
  if (document.querySelector('[data-feature-request-module]')) return;

  const DRAFT_KEY = 'family-feature-request-draft-v1';
  const ISSUE_URL = 'https://github.com/wys1110/family/issues/new';
  const MAX_LENGTH = 500;

  const main = document.querySelector('.app-shell main');
  if (!main) return;

  const section = document.createElement('section');
  section.className = 'feature-request-card';
  section.dataset.featureRequestModule = '';
  section.setAttribute('aria-labelledby', 'featureRequestTitle');
  section.innerHTML = `
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
      <p class="feature-request-note">등록을 누르면 내용이 입력된 GitHub 요청 페이지가 열려요.</p>
    </form>
  `;
  main.appendChild(section);

  const form = section.querySelector('#featureRequestForm');
  const textarea = section.querySelector('#featureRequestText');
  const count = section.querySelector('#featureRequestCount');

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

  textarea.value = readDraft();
  updateCount();

  textarea.addEventListener('input', () => {
    updateCount();
    saveDraft(textarea.value);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const request = textarea.value.trim();
    if (!request) {
      textarea.focus();
      return;
    }

    const summary = request.replace(/\s+/g, ' ').slice(0, 44);
    const activeTab = document.querySelector('.view-tab.active')?.textContent?.trim() || '가족 웹';
    const body = [
      '## 요청 내용',
      request,
      '',
      '## 요청 위치',
      activeTab,
      '',
      '---',
      '가족 웹의 기능 요청 칸에서 작성됨',
    ].join('\n');
    const url = `${ISSUE_URL}?title=${encodeURIComponent(`[기능 요청] ${summary}`)}&body=${encodeURIComponent(body)}`;
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.href = url;
  });
})();
