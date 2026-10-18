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
      <details class="assistant-saved"><summary>지난 질문 <span id="assistantSavedCount"></span></summary><p id="assistantSavedStatus" role="status">로그인하면 질문과 답변을 저장해요.</p><div id="assistantSavedList"></div></details>
      <div class="assistant-welcome"><h3>오늘은 무엇이 궁금하세요?</h3><p>수유 · 수면 · 성장, 궁금한 점을 적어 주세요.</p>
        <div class="assistant-prompts" aria-label="질문 예시">
          <button type="button" data-assistant-prompt>수유 간격은 어떻게 잡으면 좋을까요?</button>
          <button type="button" data-assistant-prompt>밤에 자주 깨는데 무엇을 살펴볼까요?</button>
          <button type="button" data-assistant-prompt>이 시기에 어떤 놀이를 해 주면 좋을까요?</button>
        </div>
      </div>
      <div class="assistant-messages" role="log" aria-label="질문과 연결 안내" aria-live="polite" aria-relevant="additions"></div>
      <form class="assistant-composer"><label for="assistantQuestion">질문</label><textarea id="assistantQuestion" rows="3" maxlength="2000" placeholder="아이의 나이와 궁금한 점을 적어 주세요" aria-describedby="assistantPrivacy" required></textarea><div class="assistant-compose-actions"><button type="button" data-assistant-clear hidden>새 대화</button><button type="submit" class="assistant-send" disabled>질문 남기기 <span aria-hidden="true">↑</span></button></div></form>
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
  const savedList = view.querySelector('#assistantSavedList');
  const savedStatus = view.querySelector('#assistantSavedStatus');
  const savedCount = view.querySelector('#assistantSavedCount');
  const savedSection = view.querySelector('.assistant-saved');
  const store = window.FAMILY_PARENTING_HISTORY;
  let selectedBabyId = null;
  let saved = [], activeQuestion = null, loadingSaved = false, cloudBusy = false;
  const cloudContext = () => store?.context() || null;
  let connection = null, pending = null, generation = 0;
  let history = [];
  const updateSend = () => { send.disabled = !!pending || cloudBusy || !input.value.trim() || input.value.length > 2000; };
  const reset = () => { generation++; pending?.abort(); pending = null; history = []; activeQuestion = null; log.setAttribute('aria-busy', 'false'); if (connection) send.textContent = '질문 보내기 ↑'; log.replaceChildren(); input.value = ''; welcome.hidden = false; clear.hidden = true; updateSend(); };
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
  babySelect.addEventListener('change', () => { reset(); saved=[]; savedList.replaceChildren(); savedCount.textContent=''; cloudBusy=false; selectedBabyId = babySelect.value; refreshContext(); loadSaved(); });
  useRecords.addEventListener('change', () => { reset(); refreshContext(); });
  refreshContext();
  // Local/demo testing can still use the private server; signed-in users always use the durable queue.
  if (!cloudContext() && (window.location?.origin === 'http://127.0.0.1:8775' || /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/.test(window.location?.origin || ''))) {
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
  const showSaved = row => {
    activeQuestion=row.id; log.replaceChildren(); welcome.hidden=true; clear.hidden=false;
    appendMessage('user','내 질문',row.question);
    if (row.answer) appendMessage('assistant','육아 어시스턴트 · Codex',row.answer);
    else appendMessage('notice', row.status==='failed' ? '답변 실패' : '답변 대기',row.error || '질문이 저장됐어요. Mac에서 답변을 준비 중입니다.');
    history = row.answer ? [{role:'user',content:row.question},{role:'assistant',content:row.answer}] : [];
  };
  async function loadSaved() {
    const ctx=cloudContext();
    if (!ctx || loadingSaved) return;
    const current=generation, baby=selectedBabyId;
    loadingSaved=true;
    try {
      const [rows, status] = await Promise.all([store.list(ctx,baby),store.status(ctx)]);
      if (generation!==current || baby!==selectedBabyId) return;
      const previous=saved.find(row=>row.id===activeQuestion);
      const changed=JSON.stringify(saved)!==JSON.stringify(rows || []);
      saved=rows || [];
      cloudBusy=saved.some(row=>['queued','processing'].includes(row.status));
      setConnectionText(status.online ? 'Codex · 연결됨' : status.registered ? 'Mac 연결 대기' : 'Mac 등록 필요',
        '질문과 답변은 본인 계정에 저장돼요. 질문·선택한 기록 요약·최근 대화를 Mac의 Codex를 통해 OpenAI로 보내요. 기록 요약은 처리 후 지워요. AI 답변은 틀릴 수 있어요.');
      savedCount.textContent=saved.length ? `(${saved.length})` : '';
      savedStatus.textContent=status.online ? (saved.length ? '최근 질문 20개 · 본인만 볼 수 있어요.' : '저장된 질문이 없어요. 첫 질문을 남겨 보세요.') : 'Mac이 켜지고 연결되면 답변해요. 질문은 DB에 저장됩니다.';
      if (changed) savedList.replaceChildren();
      for (const row of changed ? saved : []) {
        const button=document.createElement('button'); button.type='button';
        const label={queued:'대기',processing:'답변 중',completed:'답변 완료',failed:'실패'}[row.status];
        button.textContent=`${new Date(row.created_at).toLocaleDateString('ko-KR')} · ${label} — ${row.question}`;
        button.addEventListener('click',()=>{ reset(); showSaved(row); savedSection.open=false; });
        savedList.appendChild(button);
      }
      if (!activeQuestion && !log.children.length && !input.value && cloudBusy) activeQuestion=saved.find(row=>['queued','processing'].includes(row.status)).id;
      const active=saved.find(row=>row.id===activeQuestion);
      if (active && (!previous || previous.status!==active.status || previous.answer!==active.answer)) showSaved(active);
      send.textContent=cloudBusy ? '답변 대기 중…' : '질문 보내기 ↑'; updateSend();
    } catch {
      if (generation===current) { savedStatus.textContent='지난 질문을 불러오지 못했어요. 연결을 확인해 주세요.'; send.textContent='질문 보내기 ↑'; }
    } finally { loadingSaved=false; }
  }
  input.addEventListener('input', updateSend);
  view.querySelectorAll('[data-assistant-prompt]').forEach(button => button.addEventListener('click', () => {
    input.value = button.textContent; updateSend(); input.focus();
  }));
  clear.addEventListener('click', () => {
    reset(); input.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (pending || cloudBusy || !question || input.value.length > 2000) return;
    const context = refreshContext();
    appendMessage('user', '내 질문', question);
    welcome.hidden = true; clear.hidden = false; input.value = ''; updateSend();
    const ctx = cloudContext();
    if (ctx) {
      const current = generation;
      const id = crypto.randomUUID();
      pending = new AbortController(); updateSend(); send.textContent = '질문 저장 중…';
      try {
        await store.enqueue(ctx, { id, babyId:selectedBabyId, question, records:context, messages:history.slice(-8) });
        if (generation !== current) return;
        activeQuestion = id;
        appendMessage('notice','접수 완료','질문을 저장했어요. Mac에서 답변을 준비하면 여기에 표시됩니다. 화면을 닫아도 지난 질문에서 확인할 수 있어요.');
      } catch (error) {
        if (generation !== current) return;
        appendMessage('notice','저장 확인 필요', error.message || '질문 저장을 확인하지 못했어요. 지난 질문을 확인한 뒤 다시 보내 주세요.');
        input.value = question;
      } finally {
        if (generation === current) { pending=null; updateSend(); await loadSaved(); }
      }
      return;
    }
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
    loadSaved();
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
  window.addEventListener('familycontextchange', () => {
    reset(); selectedBabyId = null; saved=[]; cloudBusy=false; savedList.replaceChildren(); savedCount.textContent=''; refreshContext(); loadSaved();
  });
  loadSaved();
  setInterval(() => { if (!view.hidden && !document.hidden) loadSaved(); },5000);
})();
