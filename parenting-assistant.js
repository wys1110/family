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
  const updateSend = () => { send.disabled = !input.value.trim() || input.value.length > 2000; };
  const reset = () => { log.replaceChildren(); input.value = ''; welcome.hidden = false; clear.hidden = true; updateSend(); };
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
  form.addEventListener('submit', event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || input.value.length > 2000) return;
    appendMessage('user', '내 질문', question);
    appendMessage('notice', '연결 안내', '아직 AI 답변을 받을 수 없어요. 질문은 외부로 전송하지 않고 이 화면에만 표시했어요.');
    welcome.hidden = true; clear.hidden = false; input.value = ''; updateSend();
    log.lastElementChild.scrollIntoView({ block: 'nearest' });
  });
  const baseSwitch = window.switchView;
  const switchAssistant = function (next) {
    if (next !== 'assistant') { view.hidden = true; return baseSwitch(next); }
    baseSwitch('calendar');
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
  window.addEventListener('familycontextchange', reset);
})();
