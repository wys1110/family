(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dayKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value;
  const daysBetween = (from,to) => {
    if(!validDay(from)||!validDay(to)||from>to) throw new Error('시작일과 종료일을 확인해 주세요.');
    const days=[]; const date = new Date(`${from}T12:00:00`);
    while(dayKey(date)<=to) { days.push(dayKey(date)); if(days.length>92) throw new Error('진료 요약은 최대 92일을 선택해 주세요.'); date.setDate(date.getDate()+1); }
    return days;
  };
  const number = value => value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
  const summarize = (entries, from, to) => {
    const days = daysBetween(from,to).map(date=>({date,feedingMl:null,feedingCount:0,breastMinutes:null,sleepMinutes:null,temperature:null,diaperCount:0,recordCount:0}));
    const byDate = new Map(days.map(day=>[day.date,day]));
    const selected = entries.filter(e=>byDate.has(e.date)).sort((a,b)=>`${a.date}T${a.time||'00:00'}`.localeCompare(`${b.date}T${b.time||'00:00'}`));
    for(const entry of selected) {
      const day = byDate.get(entry.date); day.recordCount++;
      if(number(entry.feedingMl)!==null) {day.feedingMl=(day.feedingMl??0)+Number(entry.feedingMl);day.feedingCount++;}
      if(number(entry.feedingMinutes)!==null) day.breastMinutes=(day.breastMinutes??0)+Number(entry.feedingMinutes);
      if(number(entry.temperature)!==null) day.temperature=Math.max(day.temperature??-Infinity,Number(entry.temperature));
      if(entry.category==='기저귀') day.diaperCount++;
    }
    // The record time is the start of a sleep interval. Missing times stay on the recorded day.
    for(const entry of entries) {
      const minutes=number(entry.sleepMinutes); if(minutes===null || minutes<0 || !validDay(entry.date)) continue;
      if(!/^\d{2}:\d{2}$/.test(entry.time||'')) {const day=byDate.get(entry.date);if(day) day.sleepMinutes=(day.sleepMinutes??0)+minutes;continue;}
      let start=new Date(`${entry.date}T${entry.time}:00`); const end=new Date(start.getTime()+minutes*60000);
      if(!Number.isFinite(end.getTime())||minutes>7*24*60) continue;
      while(start<end) {
        const next=new Date(start);next.setHours(24,0,0,0); const stop=new Date(Math.min(next.getTime(),end.getTime()));
        const day=byDate.get(dayKey(start));if(day)day.sleepMinutes=(day.sleepMinutes??0)+(stop-start)/60000;
        start=stop;
      }
    }
    const latest = key => [...selected].reverse().find(e=>number(e[key])!==null);
    return {days,selected,measurements:['weight','height','head'].map(key=>({key,entry:latest(key)})),health:selected.filter(e=>e.category==='건강·병원'||number(e.temperature)!==null)};
  };
  const memories = (entries, month='') => entries.filter(e=>(e.category==='첫 순간'||e.photoPaths?.length||e.photoUrls?.length) && (!month||e.date.startsWith(month))).sort((a,b)=>`${b.date}T${b.time||''}`.localeCompare(`${a.date}T${a.time||''}`));
  const metric = (label,value,unit='') => `<div class="journal-metric"><span>${label}</span><strong>${escape(value)}<small>${unit}</small></strong></div>`;
  const reportHtml = (baby,summary,from,to,questions='') => {
    const amount = key => { const recorded=summary.days.filter(d=>d[key]!==null); return recorded.length ? Math.round(recorded.reduce((n,d)=>n+d[key],0)/recorded.length) : '—'; };
    const peak=summary.days.filter(d=>d.temperature!==null).map(d=>d.temperature);
    const maxMl=Math.max(1,...summary.days.map(d=>d.feedingMl||0));
    const measurements=summary.measurements.map(({key,entry})=>{const labels={weight:['몸무게','kg'],height:['키','cm'],head:['머리둘레','cm']};return `<li><span>${labels[key][0]}</span><strong>${entry?escape(entry[key]):'미기록'} ${entry?labels[key][1]:''}</strong><small>${entry?escape(entry.date):'선택 기간 내 기록 없음'}</small></li>`;}).join('');
    return `<article class="visit-paper"><header><p class="journal-eyebrow">CARE NOTES</p><h2>${escape(baby.name)}의 진료 준비</h2><p>${escape(from)} — ${escape(to)} · 생일 ${escape(baby.birthDate||'미등록')}</p></header>
    <div class="journal-metrics">${metric('기록일',summary.days.filter(d=>d.recordCount>0).length,` / ${summary.days.length}일`)}${metric('수유량 평균',amount('feedingMl'),' ml')}${metric('수면 평균',amount('sleepMinutes'),' 분')}${metric('기록된 최고 체온',peak.length?Math.max(...peak):'—',peak.length?' °C':'')}</div>
    <p class="journal-caption">평균은 해당 항목이 기록된 날짜 기준입니다. 모유 수유량은 추정하지 않으며, 미기록은 0으로 계산하지 않습니다.</p>
    <h3>기간 내 최근 성장 측정</h3><ul class="visit-measurements">${measurements}</ul>
    <h3>날짜별 기록</h3><div class="visit-table-scroll"><table><thead><tr><th>날짜</th><th>수유량</th><th>수유 시간</th><th>수면</th><th>최고 체온</th><th>기저귀</th></tr></thead><tbody>${summary.days.map(d=>`<tr><th>${escape(d.date.slice(5))}</th><td><span class="visit-bar" style="--bar:${Math.round((d.feedingMl||0)/maxMl*100)}%">${d.feedingMl===null?'—':`${d.feedingMl} ml`}</span></td><td>${d.breastMinutes===null?'—':`${d.breastMinutes}분`}</td><td>${d.sleepMinutes===null?'—':`${Math.round(d.sleepMinutes)}분`}</td><td>${d.temperature===null?'—':`${d.temperature}°C`}</td><td>${d.diaperCount||'—'}</td></tr>`).join('')}</tbody></table></div>
    <h3>건강 기록 · 메모</h3>${summary.health.length?`<ul class="visit-health">${summary.health.map(e=>`<li><time>${escape(e.date)} ${escape(e.time)}</time><strong>${escape(e.title)}</strong><p>${escape(e.note||'메모 없음')}</p></li>`).join('')}</ul>`:'<p class="journal-caption">선택 기간에 기록된 건강 메모가 없습니다.</p>'}
    <h3>진료 때 물어볼 내용</h3><p class="visit-questions">${escape(questions||'질문을 적어 주세요.')}</p>
    <footer>가족이 직접 입력한 기록의 요약입니다. 수면은 시작 시각 기준으로 날짜별 배분되며, 시각이 없으면 기록일에 합산됩니다. 진단이나 정상 여부 판단을 포함하지 않습니다.</footer></article>`;
  };
  window.FAMILY_JOURNAL = { summarize, memories, reportHtml, daysBetween };
  if(typeof document==='undefined' || !document.querySelector('#babyJournalContent')) return;
  let modal=null, activeView='', serial=0, printFrame=null;
  const context = () => ({userId:state.session?.user?.id, householdId:state.household?.id, babyId:state.activeBabyId,supabase:state.supabase});
  const current = expected => {const now=context();return ['userId','householdId','babyId','supabase'].every(key=>expected[key]===now[key]);};
  const close = () => {serial++; modal?.close();modal?.remove();modal=null;printFrame?.remove();printFrame=null;activeView='';};
  const loadEntries = async expected => {
    if(!expected.supabase || !expected.householdId) return activeBabyEntries();
    const result = await window.FAMILY_AUTH_API.withRecovery(()=>window.FAMILY_DATA.readAll(()=>expected.supabase.from('growth_entries').select('*').eq('household_id',expected.householdId).eq('baby_id',expected.babyId),{isCurrent:()=>current(expected)}),{supabase:expected.supabase,userId:expected.userId,isCurrent:()=>current(expected)});
    if(result.error)throw result.error;
    return result.data.map(fromGrowthRemote);
  };
  const createModal = (title) => {
    close(); modal=document.createElement('dialog');modal.className='journal-dialog';modal.setAttribute('aria-labelledby','journalDialogTitle');
    modal.innerHTML=`<div class="journal-dialog-head"><div><p class="journal-eyebrow">OUR FAMILY</p><h2 id="journalDialogTitle">${title}</h2></div><button type="button" data-journal-close autofocus aria-label="닫기">×</button></div><div data-journal-body></div>`;
    document.body.appendChild(modal);modal.querySelector('[data-journal-close]').addEventListener('click',close);modal.addEventListener('cancel',event=>{event.preventDefault();close();});modal.showModal();return modal.querySelector('[data-journal-body]');
  };
  const openVisit = async () => {
    if(!activeBaby())return;const expected=context(), baby={...activeBaby()};const body=createModal('진료 준비 요약');activeView='visit';const request=++serial;
    const end=dayKey(new Date()),startDate=new Date();startDate.setDate(startDate.getDate()-6);
    body.innerHTML=`<form class="visit-controls"><div class="visit-period"><label>시작일<input type="date" name="from" value="${dayKey(startDate)}" required /></label><span>—</span><label>종료일<input type="date" name="to" value="${end}" required /></label></div><label>진료 때 물어볼 질문<textarea name="questions" maxlength="3000" rows="3" placeholder="예: 최근 수유 기록을 함께 확인하고 싶어요."></textarea></label><p class="journal-caption">질문은 이 화면을 닫으면 지워집니다.</p><div class="journal-actions"><button type="submit" disabled>요약 만들기</button><button type="button" data-visit-print disabled>인쇄 / PDF 저장</button></div></form><p data-visit-status role="status">기록을 불러오는 중…</p><div data-visit-preview></div>`;
    const form=body.querySelector('form'),status=body.querySelector('[data-visit-status]'),preview=body.querySelector('[data-visit-preview]'),print=body.querySelector('[data-visit-print]');let entries=[];
    const render=()=>{try {const from=form.elements.from.value,to=form.elements.to.value;preview.innerHTML=reportHtml(baby,summarize(entries,from,to),from,to,form.elements.questions.value);status.textContent='기록을 확인한 뒤 진료 때 활용해 주세요.';print.disabled=false;} catch(error){preview.innerHTML='';print.disabled=true;status.textContent=error.message;}};
    form.addEventListener('submit',event=>{event.preventDefault();render();});
    form.addEventListener('input',()=>{print.disabled=true;status.textContent='변경한 내용으로 요약을 다시 만들어 주세요.';});
    print.addEventListener('click',()=>{
      if(!current(expected))return close();printFrame?.remove(); printFrame=document.createElement('iframe');printFrame.title='진료 요약 인쇄';printFrame.className='journal-print-frame';
      printFrame.srcdoc=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>진료 준비 요약</title><style>body{font:12px/1.6 sans-serif;color:CanvasText;margin:24px}h2{font-size:25px}h3{margin-top:20px}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid GrayText;padding:6px}p{white-space:pre-wrap}.journal-metrics,.visit-measurements{display:flex;gap:22px;list-style:none;padding:0}.journal-metric span,.visit-measurements small{display:block;font-size:11px}.journal-metric strong{font-size:20px}small{font-weight:normal}.journal-caption,footer{font-size:10px;color:GrayText}tr,li{break-inside:avoid}@page{size:A4;margin:12mm}</style></head><body>${preview.innerHTML}</body></html>`;
      printFrame.onload=()=>{if(current(expected)&&printFrame){printFrame.contentWindow.focus();printFrame.contentWindow.print();}};document.body.appendChild(printFrame);
    });
    try {entries=await loadEntries(expected);if(request!==serial||!current(expected))return;form.querySelector('[type="submit"]').disabled=false;render();}
    catch(error){if(request===serial){status.textContent='기록을 불러오지 못했어요. 닫고 다시 시도해 주세요.';form.querySelector('[type="submit"]').disabled=true;}}
  };
  const openMemories = async () => {
    if(!activeBaby())return;const expected=context(),baby={...activeBaby()};const body=createModal('성장 추억');activeView='memories';const request=++serial;
    body.innerHTML='<p role="status">추억을 모으는 중…</p>';
    try {
      const entries=await loadEntries(expected);
      if(request!==serial||!current(expected))return;
      const paths=[...new Set(entries.flatMap(e=>e.photoPaths||[]))],urls=new Map();
      if(expected.supabase) for(let i=0;i<paths.length;i+=50) {
        const result=await window.FAMILY_AUTH_API.withRecovery(()=>expected.supabase.storage.from('growth-photos').createSignedUrls(paths.slice(i,i+50),3600),{supabase:expected.supabase,userId:expected.userId,isCurrent:()=>current(expected)});
        if(result.error)throw result.error;(result.data||[]).forEach(p=>{if(p.signedUrl)urls.set(p.path,p.signedUrl);});
        if(request!==serial||!current(expected))return;
      }
      if(expected.supabase)entries.forEach(e=>{e.photoUrls=e.photoPaths.map(p=>urls.get(p)||'');});
      const all=memories(entries), months=[...new Set(all.map(e=>e.date.slice(0,7)))];
      body.innerHTML=`<section class="memory-cover"><p class="journal-eyebrow">LITTLE MOMENTS, BIG LOVE</p><h3>${escape(baby.name)}의<br>처음과 오늘</h3><p>다시 꺼내 보고 싶은 순간들</p><div>${metric('추억',all.length,'개')}${metric('첫 순간',all.filter(e=>e.category==='첫 순간').length,'개')}</div></section><div class="memory-toolbar"><label>월별 모아보기<select data-memory-month><option value="">전체</option>${months.map(m=>`<option value="${escape(m)}">${escape(m.replace('-','년 '))}월</option>`).join('')}</select></label><button type="button" data-memory-add>＋ 첫 순간 기록</button></div><div data-memory-grid></div>`;
      const grid=body.querySelector('[data-memory-grid]');
      const render=()=>{const items=memories(entries,body.querySelector('select').value);const groups=Object.groupBy?Object.groupBy(items,e=>e.date.slice(0,7)):items.reduce((a,e)=>{(a[e.date.slice(0,7)]??=[]).push(e);return a;},{});
        grid.innerHTML=items.length?Object.entries(groups).map(([month,rows])=>`<section class="memory-month"><h3>${escape(month.replace('-','년 '))}월 <small>${rows.length}개의 순간</small></h3><div class="memory-grid">${rows.map(e=>{const url=e.photoUrls?.find(Boolean);return `<button class="memory-card ${url?'':'memory-card-text'}" type="button" data-memory-id="${escape(e.id)}"><span class="memory-photo">${url&&/^(https:|data:image\/)/.test(url)?`<img src="${escape(url)}" alt="${escape(e.title)}" loading="lazy" />`:'<span class="memory-placeholder" aria-hidden="true">✧</span>'}${e.category==='첫 순간'?'<span class="memory-badge">처음의 순간</span>':''}</span><span class="memory-copy"><time>${escape(e.date.slice(5).replace('-','.'))}</time><strong>${escape(e.title)}</strong><span>${escape(e.note||'우리 가족의 소중한 한 장면')}</span></span></button>`;}).join('')}</div></section>`).join(''):'<div class="journal-empty"><span aria-hidden="true">✧</span><h3>첫 추억을 남겨볼까요?</h3><p>첫 순간이나 사진을 기록하면 이곳에 모여요.</p></div>';
        grid.querySelectorAll('[data-memory-id]').forEach(button=>button.addEventListener('click',()=>{const entry=entries.find(e=>e.id===button.dataset.memoryId);if(!current(expected))return close();close();openGrowthDialog(entry);}));
        grid.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{const mark=document.createElement('span');mark.className='memory-placeholder';mark.textContent='사진을 불러오지 못했어요';img.replaceWith(mark);}));
      };
      body.querySelector('select').addEventListener('change',render);body.querySelector('[data-memory-add]').addEventListener('click',()=>{close();openGrowthDialog(null,'첫 순간');});render();
    } catch(error) {if(request===serial)body.innerHTML='<p role="alert">추억을 불러오지 못했어요. 닫고 다시 시도해 주세요.</p>';}
  };
  const toolbar=document.createElement('nav');toolbar.className='journal-tools';toolbar.setAttribute('aria-label','성장 기록 활용');toolbar.innerHTML='<button type="button" data-journal-visit><span aria-hidden="true">▤</span><strong>진료 준비</strong><small>기록을 한 장으로</small><b aria-hidden="true">↗</b></button><button type="button" data-journal-memories><span aria-hidden="true">✧</span><strong>성장 추억</strong><small>처음과 오늘을 모아</small><b aria-hidden="true">↗</b></button>';
  document.querySelector('#babySelector').after(toolbar);toolbar.querySelector('[data-journal-visit]').addEventListener('click',openVisit);toolbar.querySelector('[data-journal-memories]').addEventListener('click',openMemories);
  window.addEventListener('familycontextchange',close);window.addEventListener('familybabychange',close);
})();
