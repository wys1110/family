(() => {
  const $ = s => document.querySelector(s);
  const labels = {today:'오늘',growth:'성장',care:'육아',stories:'동화',more:'더보기',travel:'여행',settings:'설정'};
  let sleeping = true, timer;
  const say = text => { $('#feedback').textContent=text; $('#feedback').hidden=false; clearTimeout(timer); timer=setTimeout(()=>$('#feedback').hidden=true,3500); };
  const open = page => {
    document.querySelectorAll('[data-page]').forEach(e=>e.hidden=e.dataset.page!==page);
    $('#title').textContent=labels[page];
    $('#subtitle').textContent=page==='today'?'11월 1일 일요일':'우리 가족';
    $('#quickDock').hidden=!['today','growth'].includes(page);
    document.querySelectorAll('nav button').forEach(e=>e.toggleAttribute('aria-current',false));
    const selected=document.querySelector(`nav [data-open="${['travel','settings'].includes(page)?'more':page}"]`);
    selected?.setAttribute('aria-current','page');
    $('header .round').hidden=!['today','growth','travel'].includes(page);
    $('header .round').dataset.record={today:'일정 추가',growth:'성장 기록',travel:'여행 추가'}[page]||'기록 추가';
    $('header .round').setAttribute('aria-label',$('header .round').dataset.record);
    window.scrollTo(0,0);
  };
  const sheet=(title,description,record=false)=>{
    $('#sheetTitle').textContent=title; $('#sheetDescription').textContent=description;
    $('#recordFields').hidden=!record; $('#sheetDone').textContent=record?'가상 기록 확인':'확인';
    $('#sheet').showModal();
  };
  const dark = value => {document.documentElement.toggleAttribute('data-dark',value);$('#darkToggle').checked=value;$('#appearance').setAttribute('aria-label',value?'밝은 화면으로 보기':'어두운 화면으로 보기');};
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.open)open(button.dataset.open);
    if(button.hasAttribute('data-sleep')){
      sleeping=!sleeping;
      document.querySelectorAll('[data-sleep-label]').forEach(e=>e.textContent=sleeping?'자는 중':'깨어 있어요');
      document.querySelectorAll('[data-sleep-time]').forEach(e=>e.textContent=sleeping?'방금 시작 · 가상 상태':'수면을 마쳤어요 · 가상 상태');
      document.querySelectorAll('[data-sleep]').forEach(e=>{const span=e.querySelector('[data-sleep-action]');(span||e).textContent=sleeping?'수면 끝':'수면 시작';});
      say('시안 상태만 바뀌었습니다. 실제 기록은 저장하지 않습니다.');
    }
    if(button.dataset.record)sheet(button.dataset.record,'입력 화면 배치 예시입니다. 입력한 값은 저장하거나 전송하지 않습니다.',true);
    if(button.dataset.detail)sheet(button.dataset.detail,'상세 화면으로 연결되는 위치입니다. 실제 기록·설정은 현재 앱에 그대로 있으며 이 시안에서는 변경하지 않습니다.');
    if(button.dataset.story)sheet(button.dataset.story,'읽기 화면 예시입니다. 실제 적용 시 기존 동화 본문과 읽기 기능을 연결합니다.');
    if(button.dataset.question){$('#question').value=button.dataset.question;$('#question').focus();}
    if(button.dataset.calendar){$('#month').hidden=button.dataset.calendar!=='month';document.querySelectorAll('[data-calendar]').forEach(e=>{e.classList.toggle('selected',e===button);e.setAttribute('aria-pressed',String(e===button));});}
    if(button.dataset.language){document.querySelectorAll('[data-language]').forEach(e=>{e.classList.toggle('selected',e===button);e.setAttribute('aria-pressed',String(e===button));});document.querySelectorAll('[data-story] strong').forEach((e,i)=>e.textContent=button.dataset.language==='ko'?['작은 달의 이야기','조용한 정원','집으로 가는 길'][i]:['The Little Moon','A Quiet Garden','The Way Home'][i]);}
  });
  $('#questionForm').addEventListener('submit',event=>{event.preventDefault();say('질문 입력 모습만 확인합니다. 서버에 전송하지 않았습니다.');});
  $('#appearance').onclick=()=>dark(!document.documentElement.hasAttribute('data-dark'));
  $('#darkToggle').onchange=event=>dark(event.target.checked);
  $('#textSize').onchange=event=>document.documentElement.style.fontSize=`${event.target.value}px`;
  for(const day of ['일','월','화','수','목','금','토']){const e=document.createElement('span');e.textContent=day;$('#calendar').append(e);}
  for(let n=1;n<=30;n++){const b=document.createElement('button');b.textContent=n;b.classList.toggle('chosen',n===1);b.setAttribute('aria-label',`11월 ${n}일`);b.onclick=()=>say('날짜 선택 위치를 보여주는 시안입니다.');$('#calendar').append(b);}
})();
