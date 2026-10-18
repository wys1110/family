(() => {
  if (document.getElementById('assistantView')) return;
  const main = document.querySelector('main');
  const navigation = document.querySelector('.view-tabs');
  if (!main || !navigation || typeof window.switchView !== 'function') return;
  const view = document.createElement('section');
  view.id = 'assistantView';
  view.hidden = true;
  view.setAttribute('aria-labelledby', 'assistantTitle');
  view.innerHTML = `
    <header class="assistant-heading"><div><h2 id="assistantTitle" tabindex="-1">육아 어시스턴트</h2><p>궁금한 순간, 편하게 물어보세요.</p></div><span class="assistant-connection">AI 연결 전</span></header>
    <section class="assistant-chat" aria-label="육아 질문 대화">
      <section class="assistant-child" aria-label="답변에 참고할 아이 기록">
        <label for="assistantBaby">답변받을 아이</label><select id="assistantBaby"></select>
        <label class="assistant-context-toggle"><input id="assistantUseRecords" type="checkbox" checked> 아이 기록을 참고해서 답변</label>
        <details><summary>함께 보낼 기록 확인</summary><pre id="assistantContext"></pre></details>
        <p>선택한 아이의 생후 일수·성장·최근 7일 수유·대변·수면 요약을 질문과 함께 OpenAI로 보내요.</p>
      </section>
      <div class="assistant-welcome"><h3>오늘은 무엇이 궁금하세요?</h3><p>수유 · 수면 · 성장, 궁금한 점을 적어 주세요.</p>
        <div class="assistant-prompts" aria-label="질문 예시">
          <button type="button" data-assistant-prompt>수유 간격은 어떻게 잡으면 좋을까요?</button>
          <button type="button" data-assistant-prompt>밤에 자주 깨는데 무엇을 살펴볼까요?</button>
          <button type="button" data-assistant-prompt>이 시기에 어떤 놀이를 해 주면 좋을까요?</button>
        </div>
      </div>
      <div class="assistant-messages" role="log" aria-label="질문과 연결 안내" aria-live="polite" aria-relevant="additions"></div>
      <form class="assistant-composer"><label for="assistantQuestion">질문</label><textarea id="assistantQuestion" rows="3" maxlength="2000" placeholder="아이의 나이와 궁금한 점을 적어 주세요" aria-describedby="assistantPrivacy" required></textarea><div class="assistant-compose-actions"><button type="button" data-assistant-clear hidden>대화 비우기</button><button type="submit" class="assistant-send" disabled>질문 남기기 <span aria-hidden="true">↑</span></button></div></form>
      <p id="assistantPrivacy" class="assistant-privacy">AI 답변은 아직 연결 전이에요. 질문은 이 화면에만 남고, 새로고침하면 사라져요.</p>
    </section>`;
  main.appendChild(view);
  const input = view.querySelector('textarea');
  const form = view.querySelector('form');
  const log = view.querySelector('[role="log"]');
  const welcome = view.querySelector('.assistant-welcome');
  const send = view.querySelector('[type="submit"]');
  const clear = view.querySelector('[data-assistant-clear]');
  const babySelect = view.querySelector('#assistantBaby');
  const useRecords = view.querySelector('#assistantUseRecords');
  const contextPreview = view.querySelector('#assistantContext');
  let selectedBabyId = null;
  let connection = null, pending = null, generation = 0;
  let history = [];
  const updateSend = () => { send.disabled = !!pending || !input.value.trim() || input.value.length > 2000; };
  const reset = () => { generation++; pending?.abort(); pending = null; history = []; log.setAttribute('aria-busy', 'false'); if (connection) send.textContent = '질문 보내기 ↑'; log.replaceChildren(); input.value = ''; welcome.hidden = false; clear.hidden = true; updateSend(); };
  const setConnectionText = (status, note) => {
    view.querySelector('.assistant-connection').textContent = status;
    view.querySelector('#assistantPrivacy').textContent = note;
  };
  const refreshContext = () => {
    const state = window.FAMILY_APP_STATE || {};
    const babies = (state.babies || []).filter(baby => !baby.archivedAt);
    if (!babies.some(baby => baby.id === selectedBabyId)) { if (selectedBabyId) reset(); selectedBabyId = babies.find(baby => baby.id === state.activeBabyId)?.id || babies[0]?.id || null; }
    babySelect.replaceChildren();
    for (const baby of babies) { const option = document.createElement('option'); option.value = baby.id; option.textContent = baby.name; babySelect.appendChild(option); }
    babySelect.value = selectedBabyId || ''; babySelect.disabled = !babies.length;
    const context = window.FAMILY_PARENTING_CONTEXT?.summarize(state, selectedBabyId) || '아이 기록이 없어요.';
    contextPreview.textContent = useRecords.checked ? context : '아이 기록을 보내지 않고 질문에만 답해요.';
    return useRecords.checked ? context : '';
  };
  babySelect.addEventListener('change', () => { reset(); selectedBabyId = babySelect.value; refreshContext(); });
  useRecords.addEventListener('change', () => { reset(); refreshContext(); });
  refreshContext();
  // shortcut: personal access uses loopback or owner-authenticated Tailscale Serve; shared hosting needs its own auth route.
  if (window.location?.origin === 'http://127.0.0.1:8775' || /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/.test(window.location?.origin || '')) {
    fetch('/api/parenting/status', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(status => {
      if (status?.provider !== 'codex-local' || !status.token) throw new Error('offline');
      connection = status.token;
      setConnectionText('Codex · 5.6 Sol', '연결된 Mac의 Codex 구독으로 답변받아요. 선택한 기록 요약·질문·최근 대화를 OpenAI로 보내요. 새로고침하면 대화가 사라져요. AI 답변은 틀릴 수 있어요.');
      send.textContent = '질문 보내기 ↑';
    }).catch(() => setConnectionText('연결 끊김', 'Mac의 채팅 서버와 Tailscale 연결을 확인한 뒤 새로고침해 주세요.'));
  }
  const appendMessage = (kind, label, text) => {
    const message = document.createElement('article');
    message.className = `assistant-message assistant-message-${kind}`;
    const author = document.createElement('span'); author.className = 'assistant-author'; author.textContent = label;
    const body = document.createElement('p'); body.textContent = text;
    message.append(author, body); log.appendChild(message);
  };
  input.addEventListener('input', updateSend);
  view.querySelectorAll('[data-assistant-prompt]').forEach(button => button.addEventListener('click', () => {
    input.value = button.textContent; updateSend(); input.focus();
  }));
  clear.addEventListener('click', () => {
    if (window.confirm('이 화면의 질문을 모두 비울까요?')) { reset(); input.focus(); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (pending || !question || input.value.length > 2000) return;
    const context = refreshContext();
    appendMessage('user', '내 질문', question);
    welcome.hidden = true; clear.hidden = false; input.value = ''; updateSend();
    if (!connection) {
      appendMessage('notice', '연결 안내', '아직 AI 답변을 받을 수 없어요. 질문은 외부로 전송하지 않고 이 화면에만 표시했어요.');
      log.lastElementChild.scrollIntoView({ block: 'nearest' });
      return;
    }
    const current = generation;
    pending = new AbortController(); updateSend();
    log.setAttribute('aria-busy', 'true'); send.textContent = '답변 준비 중…';
    const messages = [...history.slice(-8), { role: 'user', content: question }];
    try {
      const response = await fetch('/api/parenting/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Chat-Token': connection }, body: JSON.stringify({ messages, context }), signal: pending.signal });
      const result = await response.json();
      if (!response.ok || typeof result.answer !== 'string' || !result.answer.trim()) throw new Error(result.error || '답변을 받지 못했어요. 다시 시도해 주세요.');
      if (generation !== current) return;
      history = [...messages, { role: 'assistant', content: result.answer }];
      appendMessage('assistant', '육아 어시스턴트 · Codex', result.answer);
    } catch (error) {
      if (generation !== current) return;
      appendMessage('notice', '연결 안내', error.name === 'AbortError' ? '답변 요청을 취소했어요.' : error.message);
      if (!input.value) input.value = question;
    } finally {
      if (generation === current) { pending = null; log.setAttribute('aria-busy', 'false'); send.textContent = '질문 보내기 ↑'; updateSend(); }
    }
    if (generation !== current) return;
    log.lastElementChild.scrollIntoView({ block: 'nearest' });
  });
  const baseSwitch = window.switchView;
  const switchAssistant = function (next) {
    if (next !== 'assistant') { view.hidden = true; return baseSwitch(next); }
    baseSwitch('calendar');
    refreshContext();
    main.querySelectorAll(':scope > [id$="View"]').forEach(other => { other.hidden = other !== view; });
    if (window.FAMILY_APP_STATE) window.FAMILY_APP_STATE.activeView = 'assistant';
    navigation.querySelectorAll('.view-tab[data-view]').forEach(tab => {
      const active = tab.dataset.view === 'assistant';
      tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    });
    document.querySelector('#addEventButton')?.setAttribute('hidden', '');
    try { localStorage.setItem(ACTIVE_VIEW_KEY, 'assistant'); } catch { /* The current screen remains usable. */ }
  };
  Object.assign(switchAssistant, baseSwitch);
  window.switchView = switchAssistant;
  navigation.addEventListener('click', event => {
    if (event.target.closest?.('.view-tab[data-view="assistant"]')) window.switchView('assistant');
  });
  window.addEventListener('familycontextchange', () => { reset(); selectedBabyId = null; refreshContext(); });
})();
