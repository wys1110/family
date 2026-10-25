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
    <header class="assistant-heading"><div><h2 id="assistantTitle" tabindex="-1">육아 어시스턴트</h2><p>함께 살펴보는 우리 아이의 하루</p></div><span class="assistant-connection">AI 연결 전</span></header>
    <section class="assistant-chat" aria-label="육아 질문 대화">
      <section class="assistant-child" aria-label="답변에 참고할 아이 기록">
        <div class="assistant-child-picker"><label for="assistantBaby">답변받을 아이</label><select id="assistantBaby"></select></div>
        <label class="assistant-context-toggle"><input id="assistantUseRecords" type="checkbox" checked> 아이 기록 참고</label>
        <details class="assistant-records"><summary>함께 보낼 기록 확인</summary><pre id="assistantContext"></pre><p>선택한 아이의 생후 일수·성장·최근 7일 수유·대변·수면 요약을 질문과 함께 OpenAI로 보내요.</p></details>
      </section>
      <div class="assistant-toolbar"><details class="assistant-saved"><summary>지난 질문 <span id="assistantSavedCount"></span></summary><p id="assistantSavedStatus" role="status">로그인하면 질문과 답변을 저장해요.</p><div id="assistantSavedList"></div></details><button type="button" data-assistant-clear hidden>새 대화 ＋</button></div><p id="assistantQueueStatus" role="status" hidden></p>
      <div class="assistant-welcome"><h3>오늘은 무엇이 궁금하세요?</h3><p>수유 · 수면 · 성장, 궁금한 점을 적어 주세요.</p>
        <div class="assistant-prompts" aria-label="질문 예시">
          <button type="button" data-assistant-prompt>수유 간격은 어떻게 잡으면 좋을까요?</button>
          <button type="button" data-assistant-prompt>밤에 자주 깨는데 무엇을 살펴볼까요?</button>
          <button type="button" data-assistant-prompt>이 시기에 어떤 놀이를 해 주면 좋을까요?</button>
        </div>
      </div>
      <div class="assistant-messages" role="log" aria-label="질문과 연결 안내" aria-live="polite" aria-relevant="additions"></div>
      <div class="assistant-recovery"><button type="button" id="assistantCancel" hidden>대기 취소</button><button type="button" id="assistantRetry" hidden>질문 다시 작성 ↗</button><button type="button" id="assistantResolve" hidden>접수 확인 / 재전송</button><p id="assistantActionStatus" role="status" hidden></p></div>
      <form class="assistant-composer"><label for="assistantQuestion">질문</label><textarea id="assistantQuestion" rows="3" maxlength="2000" placeholder="궁금한 점을 편하게 적어 주세요" aria-describedby="assistantPrivacy" required></textarea><div class="assistant-compose-actions"><span id="assistantComposeHint">한 번에 하나의 질문에 답해요</span><button type="submit" class="assistant-send" disabled>질문 남기기 <span aria-hidden="true">↑</span></button></div></form>
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
  const queueStatus = view.querySelector('#assistantQueueStatus');
  const cancel = view.querySelector('#assistantCancel');
  const retry = view.querySelector('#assistantRetry');
  const resolve = view.querySelector('#assistantResolve');
  const actionStatus = view.querySelector('#assistantActionStatus');
  const store = window.FAMILY_PARENTING_HISTORY;
  let selectedBabyId = null;
  let saved = [], activeQuestion = null, loadingSaved = false, cloudBusy = false;
  const cloudContext = () => store?.context() || null;
  let connection = null, pending = null, generation = 0;
  let history = [], workerStatus = null, uncertain = null, actionBusy = false, activeNotice = null;
  const updateSend = () => { send.disabled = !!pending || cloudBusy || !!uncertain || actionBusy || !input.value.trim() || input.value.length > 2000; };
  const reset = () => { generation++; pending?.abort(); pending = null; history = []; activeQuestion = null; activeNotice = null; retry.hidden=true; actionStatus.hidden=true; log.setAttribute('aria-busy', 'false'); if (connection) send.textContent = '질문 보내기 ↑'; log.replaceChildren(); input.value = ''; welcome.hidden = false; clear.hidden = true; updateSend(); };
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
    babySelect.value = selectedBabyId || ''; babySelect.disabled = !babies.length || !!uncertain; useRecords.disabled=!!uncertain;
    const context = window.FAMILY_PARENTING_CONTEXT?.summarize(state, selectedBabyId) || '아이 기록이 없어요.';
    contextPreview.textContent = useRecords.checked ? context : '아이 기록을 보내지 않고 질문에만 답해요.';
    return useRecords.checked ? context : '';
  };
  babySelect.addEventListener('change', () => { const draft=input.value; reset(); input.value=draft; saved=[]; savedList.replaceChildren(); savedCount.textContent=''; selectedBabyId = babySelect.value; refreshContext(); loadSaved(); });
  useRecords.addEventListener('change', () => { const draft=input.value; reset(); input.value=draft; refreshContext(); updateSend(); });
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
  const elapsed = date => {
    const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(date))/1000));
    if (!Number.isFinite(seconds)) return '';
    return seconds<60 ? `${seconds}초` : seconds<3600 ? `${Math.floor(seconds/60)}분` : `${Math.floor(seconds/3600)}시간`;
  };
  const labels={queued:'질문 접수',processing:'답변 작성 중',completed:'답변 완료',failed:'답변 실패',cancelled:'취소됨'};
  const describe = row => {
    const age=elapsed(row.status==='processing' ? row.started_at : row.created_at);
    const timing=age ? `\n${row.status==='processing' ? '처리 시작' : '접수 후'} ${age} 경과` : '';
    if (row.status==='queued') return (workerStatus?.online ? '질문을 잘 받았어요. 곧 답변을 시작해요.' : '질문을 잘 받았어요. Mac 연결을 기다리고 있어요.')+timing;
    if (row.status==='processing') return '답변을 작성하고 있어요. 화면을 닫아도 지난 질문에서 확인할 수 있어요.'+timing;
    if (row.status==='cancelled') return '대기를 취소했어요. 질문은 지난 질문에 남아 있어요.';
    return row.error || '답변을 받지 못했어요. 질문을 다시 확인하고 보내 주세요.';
  };
  const showSaved = row => {
    activeQuestion=row.id; log.replaceChildren(); welcome.hidden=true; clear.hidden=false;
    appendMessage('user','내 질문',row.question);
    appendMessage(row.answer ? 'assistant' : 'notice','육아 어시스턴트 · Codex',row.answer || describe(row));
    activeNotice=row.answer ? null : log.lastElementChild.children[1];
    retry.hidden=!['failed','cancelled'].includes(row.status);
    history = row.answer ? [{role:'user',content:row.question},{role:'assistant',content:row.answer}] : [];
  };
  const refreshQueue = () => {
    const job=workerStatus?.pending || saved.find(row=>['queued','processing'].includes(row.status));
    cloudBusy=!!job;
    queueStatus.hidden=!job;
    if (job) {
      const other=job.baby_id!==selectedBabyId || (job.household_id && job.household_id!==cloudContext()?.householdId);
      queueStatus.textContent=`${other ? '다른 아이 또는 가족의 질문 · ' : ''}${labels[job.status]}${elapsed(job.created_at) ? ` · ${elapsed(job.created_at)} 경과` : ''}`;
    }
    cancel.hidden=!job || job.status!=='queued' || ('household_id' in job && job.household_id!==cloudContext()?.householdId);
    cancel.disabled=actionBusy;
    resolve.hidden=!uncertain; resolve.disabled=actionBusy;
    send.textContent=uncertain ? '접수 확인 필요' : cloudBusy ? '답변 대기 중…' : '질문 보내기 ↑';
    updateSend();
  };
  async function loadSaved() {
    const ctx=cloudContext();
    if (!ctx || loadingSaved) return;
    const current=generation, baby=selectedBabyId;
    loadingSaved=true;
    try {
      // Status expires stale work before history is read.
      const status=await store.status(ctx);
      const rows=await store.list(ctx,baby);
      if (generation!==current || baby!==selectedBabyId) return;
      workerStatus=status;
      if (uncertain && store.find) {
        const received=await store.find(ctx,uncertain.id);
        if (generation!==current) return;
        if (received) { uncertain=null; activeQuestion=received.id; input.value=''; refreshContext(); }
      }
      const previous=saved.find(row=>row.id===activeQuestion);
      const changed=JSON.stringify(saved)!==JSON.stringify(rows || []);
      saved=rows || [];
      setConnectionText(status.online ? 'Codex · 연결됨' : status.registered ? 'Mac 연결 대기' : 'Mac 등록 필요',
        '질문과 답변은 본인만 볼 수 있어요. 선택한 기록 요약·질문·최근 대화를 Mac의 Codex를 통해 OpenAI로 보내요. 기록 요약은 처리 후 지워요. AI 답변은 틀릴 수 있어요.');
      savedCount.textContent=saved.length ? `(${saved.length})` : '';
      savedStatus.textContent=(saved.length ? '최근 질문 20개 · 본인만 볼 수 있어요.' : '저장된 질문이 없어요.')+(status.last_seen_at ? ` 마지막 Mac 연결: ${elapsed(status.last_seen_at)} 전.` : '');
      if (changed) savedList.replaceChildren();
      for (const row of changed ? saved : []) {
        const button=document.createElement('button'); button.type='button';
        button.textContent=`${new Date(row.created_at).toLocaleDateString('ko-KR')} · ${labels[row.status]} — ${row.question}`;
        button.addEventListener('click',()=>{ reset(); showSaved(row); savedSection.open=false; });
        savedList.appendChild(button);
      }
      const pendingRow=saved.find(row=>['queued','processing'].includes(row.status));
      if (!activeQuestion && !log.children.length && !input.value && pendingRow) activeQuestion=pendingRow.id;
      const active=saved.find(row=>row.id===activeQuestion);
      if (active && (!previous || previous.status!==active.status || previous.answer!==active.answer)) showSaved(active);
      else if (active && activeNotice) activeNotice.textContent=describe(active);
      refreshQueue();
    } catch {
      if (generation===current) {
        view.querySelector('.assistant-connection').textContent='저장소 연결 확인 필요';
        savedStatus.textContent='질문 상태를 확인하지 못했어요. 인터넷 연결을 확인해 주세요. Mac 연결 상태는 아직 알 수 없어요.';
        queueStatus.hidden=false; queueStatus.textContent=savedStatus.textContent;
      }
    } finally { loadingSaved=false; if (generation!==current || baby!==selectedBabyId) loadSaved(); }
  }
  cancel.addEventListener('click',async()=>{
    const ctx=cloudContext(), job=workerStatus?.pending || saved.find(row=>row.status==='queued');
    if (!ctx || !job || actionBusy) return;
    const current=generation; actionBusy=true; refreshQueue();
    try {
      const status=await store.cancel(ctx,job.id);
      if (generation!==current) return;
      actionStatus.hidden=false; actionStatus.textContent=status==='cancelled' ? '대기를 취소했어요.' : status==='processing' ? '이미 답변을 시작해서 취소할 수 없어요.' : '질문 상태가 바뀌었어요. 최신 상태를 확인해 주세요.';
    } catch { if (generation===current) { actionStatus.hidden=false; actionStatus.textContent='취소 여부를 확인하지 못했어요. 상태를 다시 확인해 주세요.'; } }
    finally { actionBusy=false; if (generation===current) { await loadSaved(); refreshQueue(); } }
  });
  retry.addEventListener('click',()=>{
    const row=saved.find(row=>row.id===activeQuestion);
    if (!row || !['failed','cancelled'].includes(row.status)) return;
    reset(); refreshContext(); input.value=row.question;
    actionStatus.hidden=false; actionStatus.textContent='질문만 가져왔어요. 위에서 답변받을 아이와 기록 포함 여부를 확인한 뒤 보내 주세요.';
    updateSend(); input.focus();
  });
  resolve.addEventListener('click',async()=>{
    const ctx=cloudContext(), request=uncertain, current=generation;
    if (!ctx || !request || actionBusy) return;
    actionBusy=true; refreshQueue();
    try {
      const row=await store.find(ctx,request.id);
      if (generation!==current) return;
      if (!row) await store.enqueue(ctx,request);
      if (generation!==current) return;
      uncertain=null; activeQuestion=request.id; input.value=''; refreshContext();
    } catch { if (generation===current) { actionStatus.hidden=false; actionStatus.textContent='접수를 확인하지 못했어요. 같은 질문 번호로 다시 확인할 수 있어요.'; } }
    finally { actionBusy=false; if (generation===current) { await loadSaved(); refreshQueue(); } }
  });
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
    if (pending || cloudBusy || uncertain || actionBusy || !question || input.value.length > 2000) return;
    const context = refreshContext();
    appendMessage('user', '내 질문', question);
    welcome.hidden = true; clear.hidden = false; input.value = ''; updateSend();
    const ctx = cloudContext();
    if (ctx) {
      const current = generation;
      const id = crypto.randomUUID();
      const request={ id, babyId:selectedBabyId, question, records:context, messages:history.slice(-8) };
      pending = new AbortController(); updateSend(); send.textContent = '질문 저장 중…';
      try {
        await store.enqueue(ctx, request);
        if (generation !== current) return;
        activeQuestion = id;
        appendMessage('notice','접수 완료','질문을 저장했어요. Mac에서 답변을 준비하면 여기에 표시됩니다. 화면을 닫아도 지난 질문에서 확인할 수 있어요.');
      } catch (error) {
        if (generation !== current) return;
        appendMessage('notice','저장 확인 필요', error.message || '질문 저장을 확인하지 못했어요. 지난 질문을 확인한 뒤 다시 보내 주세요.');
        input.value = question;
        if (!['P0001','23514','23503','42501'].includes(error.code)) uncertain=request;
        refreshContext(); refreshQueue();
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
    uncertain=null; workerStatus=null; reset(); selectedBabyId = null; saved=[]; cloudBusy=false; queueStatus.hidden=true; cancel.hidden=true; resolve.hidden=true; savedList.replaceChildren(); savedCount.textContent=''; refreshContext(); loadSaved();
  });
  loadSaved();
  setInterval(() => { if (!view.hidden && !document.hidden) loadSaved(); },5000);
})();
