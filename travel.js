(() => {
  if (window.FAMILY_TRAVEL_READY) return;
  const data = window.FAMILY_TRAVEL_DATA;
  const management = window.FAMILY_TRAVEL_MANAGEMENT;
  if (!data || !management) return;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  const $ = (selector, root = document) => root.querySelector(selector);
  const fmtDate = value => { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { month:'short', day:'numeric', weekday:'short' }).format(date); };
  const days = trip => data.dateList(trip.startDate, trip.endDate);
  const dayLabel = (trip, index) => `DAY ${index + 1}`;
  const current = { page:'plan', query:'', filter:'all', itineraryQuery:'', itineraryStatus:'all', selecting:false, selectedIds:new Set(), bulkDay:'choose', bulkBusy:false, bulkMessage:'', bulkError:false, tripId:null, tab:'all', editingId:null, modalMode:null, placeSaving:false, searchRequest:0 };
  let bulkRequest=0;
  let view;
  let refreshPromise = null;
  let travelViewportListener = null;
  const clearTravelViewport = node => {
    if(travelViewportListener && window.visualViewport){window.visualViewport.removeEventListener('resize',travelViewportListener);window.visualViewport.removeEventListener('scroll',travelViewportListener);}
    travelViewportListener=null;
    node?.style.removeProperty('--travel-viewport-height');
    node?.style.removeProperty('--travel-viewport-top');
  };
  const trip = () => data.getTrip(current.tripId) || null;
  const clearSelection = () => {bulkRequest++;current.selecting=false;current.selectedIds.clear();current.bulkDay='choose';current.bulkBusy=false;current.bulkMessage='';current.bulkError=false;};
  const clearItineraryFilters = () => {current.itineraryQuery='';current.itineraryStatus='all';};
  const bulkToolbar = item => {
    if(!current.selecting)return `<button type="button" class="travel-secondary-button" data-travel-bulk-start ${item.items.some(entry=>entry.type==='place')?'':'disabled'}>여러 장소 선택</button>`;
    const count=current.selectedIds.size, disabled=!count||current.bulkBusy;
    return `<div class="travel-bulk-heading"><strong role="status">${count}곳 선택</strong><button type="button" class="travel-secondary-button small" data-travel-bulk-end ${current.bulkBusy?'disabled':''}>선택 끝내기</button></div><p class="travel-bulk-hint">날짜나 검색 조건을 바꿔도 선택한 장소는 유지돼요.</p><form id="travelBulkForm"><fieldset ${current.bulkBusy?'disabled':''}><div class="travel-bulk-selection"><button type="button" class="travel-secondary-button small" data-travel-bulk-visible ${activeItems(item).some(entry=>entry.type==='place')?'':'disabled'}>현재 목록 선택</button><button type="button" class="travel-secondary-button small" data-travel-bulk-clear ${disabled?'disabled':''}>선택 해제</button></div><div class="travel-bulk-date"><label>이동할 날짜<select name="dayIndex" data-travel-bulk-day><option value="choose" ${current.bulkDay==='choose'?'selected':''}>날짜 선택</option><option value="" ${current.bulkDay===''?'selected':''}>보관함 (날짜 미정)</option>${days(item).map((date,index)=>`<option value="${index}" ${current.bulkDay===String(index)?'selected':''}>${dayLabel(item,index)} · ${esc(fmtDate(date))}</option>`).join('')}</select></label><button type="submit" class="travel-primary-button" data-travel-bulk-action="move" ${disabled||current.bulkDay==='choose'?'disabled':''}>선택한 장소 이동</button></div><div class="travel-bulk-visits"><button type="submit" class="travel-secondary-button" data-travel-bulk-action="visited" ${disabled?'disabled':''}>방문함으로 표시</button><button type="submit" class="travel-secondary-button" data-travel-bulk-action="unvisited" ${disabled?'disabled':''}>방문 전으로 표시</button></div></fieldset></form><p class="travel-bulk-message${current.bulkError?' error':''}" role="status">${current.bulkBusy?'저장 중…':esc(current.bulkMessage)}</p>`;
  };
  const updateBulkView = () => {
    const active=trip(), toolbar=$('[data-travel-bulk]',view);
    if(!active||!toolbar)return;
    toolbar.classList.toggle('selecting',current.selecting);
    toolbar.innerHTML=bulkToolbar(active);
    view.querySelectorAll('[data-travel-select-place]').forEach(input=>{input.checked=current.selectedIds.has(input.dataset.travelSelectPlace);input.closest('.travel-itinerary-item')?.classList.toggle('selected',input.checked);});
  };
  const applyBulk = async action => {
    const active=trip();
    if(!active||current.bulkBusy||!current.selectedIds.size)return;
    if(!['move','visited','unvisited'].includes(action)||action==='move'&&current.bulkDay==='choose')return;
    const request=++bulkRequest, ids=[...current.selectedIds], day=current.bulkDay;
    current.bulkBusy=true;current.bulkMessage='';current.bulkError=false;render();
    try{
      if(action==='move')await data.movePlaces(active.id,ids,day===''?null:Number(day));
      else await data.setPlacesVisited(active.id,ids,action==='visited');
      if(request!==bulkRequest)return;
      current.bulkMessage=action==='move'?`${ids.length}곳을 ${day===''?'날짜 미정 보관함':`${dayLabel(active,Number(day))} · ${fmtDate(days(active)[Number(day)])}`}으로 옮겼어요.`:`${ids.length}곳을 ${action==='visited'?'방문함':'방문 전'}으로 표시했어요.`;
    }catch(error){if(request!==bulkRequest)return;current.bulkError=true;current.bulkMessage=error.message||'저장하지 못했어요. 선택한 장소를 확인한 뒤 다시 시도해 주세요.';}
    finally{if(request===bulkRequest){current.bulkBusy=false;render();view.querySelector(`[data-travel-bulk-action="${action}"]`)?.focus();}}
  };
  const itineraryOrder = (a,b) => (a.dayIndex ?? 9999)-(b.dayIndex ?? 9999) || a.order-b.order;
  const activeItems = item => {
    const items = current.tab === 'inbox' ? item.items.filter(entry => entry.dayIndex == null)
      : current.tab === 'all' ? item.items.slice()
      : item.items.filter(entry => entry.dayIndex === Number(current.tab.slice(4)));
    const {itineraryQuery='',itineraryStatus='all'}=current;
    const query=itineraryQuery.trim().toLocaleLowerCase();
    return items.filter(entry=>(itineraryStatus==='all'||entry.type==='place'&&Boolean(entry.visited)===(itineraryStatus==='visited'))&&[entry.title,entry.place?.address,entry.address,entry.note].some(value=>String(value??'').toLocaleLowerCase().includes(query))).sort(itineraryOrder);
  };
  const dayPlaces = (item, dayIndex) => activeItems(item).filter(entry => entry.type === 'place' && entry.dayIndex === dayIndex);
  const destinationGroups = [['국내',['제주','부산','강릉','경주']],['일본',['오키나와','도쿄','오사카','후쿠오카','삿포로']],['아시아',['타이베이','홍콩','다낭','방콕','싱가포르','발리']],['기타',['괌','하와이','파리','로마','바르셀로나']]];
  const destinationOptions = value => `<option value="" ${value ? '' : 'selected'}>여행지를 선택해 주세요</option><option value="__custom" ${value && !destinationGroups.some(([,items])=>items.includes(value)) ? 'selected' : ''}>직접 입력</option>${destinationGroups.map(([group,items])=>`<optgroup label="${group}">${items.map(item=>`<option value="${esc(item)}" ${item===value?'selected':''}>${esc(item)}</option>`).join('')}</optgroup>`).join('')}`;
  const resolveDestination = values => String(values.destination === '__custom' ? values.destinationCustom ?? '' : values.destination ?? '').trim();
  const reconcileDestinationInputs = target => { const form=target.closest?.('#travelTripForm'); if(!form||target!==form.elements.destination)return; const custom=form.elements.destinationCustom,show=target.value==='__custom'; custom.parentElement.hidden=!show; custom.disabled=!show; custom.required=show; };
  document.addEventListener('change', event => reconcileDestinationInputs(event.target));
  const modalShell = () => `<dialog class="travel-modal" id="travelModal" aria-labelledby="travelModalTitle" hidden><div class="travel-modal-backdrop" data-travel-close></div><section class="travel-modal-panel" tabindex="-1" autofocus><header><div><h2 id="travelModalTitle">기록 추가</h2></div><button type="button" class="travel-modal-close" data-travel-close aria-label="닫기">×</button></header><div id="travelModalContent"></div></section></dialog>`;
  const showModal = (title, markup) => { const node=$('#travelModal',view); if(!node)return; node.querySelector('#travelModalTitle').textContent=title; node.querySelector('#travelModalContent').innerHTML=markup; if(!node.dataset.lifecycleBound){node.dataset.lifecycleBound='true';node.addEventListener('cancel',event=>{event.preventDefault();closeModal();render();});node.addEventListener('close',()=>{if(node.open||$('#travelModal',view)!==node)return;node.hidden=true;clearTravelViewport(node);current.modalMode=null;});} if(window.visualViewport){clearTravelViewport(node);travelViewportListener=()=>{node.style.setProperty('--travel-viewport-height',`${window.visualViewport.height}px`);node.style.setProperty('--travel-viewport-top',`${window.visualViewport.offsetTop}px`);};window.visualViewport.addEventListener('resize',travelViewportListener);window.visualViewport.addEventListener('scroll',travelViewportListener);travelViewportListener();} node.hidden=false; node.showModal(); node.querySelector('.travel-modal-panel')?.focus(); };
  const closeModal = () => { current.searchRequest++; const node=$('#travelModal',view); if(node){ if(node.open)node.close(); node.hidden=true; clearTravelViewport(node); } current.modalMode=null;  };
  const tripForm = item => {
    const destination=item?.destinationLabel || item?.destination || '';
    const custom=destination && !destinationGroups.some(([,items])=>items.includes(destination));
    return `<form id="travelTripForm"><label>여행 이름<input name="title" maxlength="60" required placeholder="예: 도윤이와 첫 오키나와" value="${esc(item?.title || '')}"></label><label>여행지<select name="destination" required>${destinationOptions(destination)}</select></label><label ${custom?'':'hidden'}>여행지 직접 입력<input name="destinationCustom" maxlength="120" ${custom?'required':'disabled'} placeholder="예: 보성 · 여수 · 남원" value="${esc(custom?destination:'')}"></label><div class="travel-form-grid travel-trip-dates"><label>출발일<input type="date" name="startDate" required value="${esc(item?.startDate || '')}"></label><label>마지막 날<input type="date" name="endDate" required value="${esc(item?.endDate || '')}"></label></div><label>여행 한 줄 소개 (선택)<textarea name="intro" maxlength="240" rows="2" placeholder="기억하고 싶은 여행 이야기를 적어 주세요">${esc(item?.intro || '')}</textarea></label><p class="travel-trip-error" role="alert" hidden></p><button type="submit" class="travel-primary-button">${item?'저장하기':'여행 만들기'}</button></form>`;
  };
  const defaultDayIndex = () => current.tab.startsWith('day-') ? Number(current.tab.slice(4)) : null;
  const daySelect = (item, selectedDay = defaultDayIndex()) => `<label>날짜<select name="dayIndex"><option value="" ${selectedDay == null ? 'selected' : ''}>보관함 (날짜 미정)</option>${days(item).map((date,index)=>`<option value="${index}" ${selectedDay===index?'selected':''}>${dayLabel(item,index)} · ${esc(fmtDate(date))}</option>`).join('')}</select></label>`;
  const placeForm = (item, selectedDay = defaultDayIndex()) => `<form id="travelPlaceForm">
    <div class="travel-form-grid">${daySelect(item,selectedDay)}<label>방문 여부<select name="visited"><option value="true" ${data.summarizeTrips([item]).pastTrips?'selected':''}>다녀왔어요</option><option value="false" ${data.summarizeTrips([item]).pastTrips?'':'selected'}>갈 예정이에요</option></select></label></div>
    <p class="travel-place-status" role="status">장소 검색을 확인하고 있어요…</p>
    <section class="travel-place-discovery" aria-label="지역에서 장소 찾기" hidden>
      <label>찾을 지역<input name="region" maxlength="60" value="${esc(item.destinationLabel)}" placeholder="예: 여수"></label>
      <div class="travel-place-categories" role="group" aria-label="장소 종류">${['관광지','음식점','카페','숙소'].map(category=>`<button type="button" class="travel-secondary-button small" data-travel-category="${category}" aria-pressed="false">${category}</button>`).join('')}</div>
      <div class="travel-search-row"><input name="query" aria-label="장소 이름 검색" maxlength="120" placeholder="장소 이름으로 찾기" autocomplete="off" enterkeyhint="search"><button type="button" class="travel-secondary-button" data-travel-search>검색</button></div>
      <div id="travelPlaceResults" class="travel-place-results" aria-live="polite"></div>
    </section>
    <details class="travel-manual-place"><summary>이름으로 직접 추가</summary><label>장소 이름<input name="title" maxlength="120" placeholder="예: 여수 해상케이블카"></label><details class="travel-place-details"><summary>주소 · 시간 · 메모 (선택)</summary><label>주소<input name="address" maxlength="240"></label><label>시간<input name="time" type="time"></label><label>메모<textarea name="note" maxlength="2000" rows="2"></textarea></label></details><p class="travel-form-hint">이름만으로 저장할 수 있어요. 검색 결과를 선택하면 주소가 함께 저장돼요.</p><button type="submit" class="travel-primary-button">추가하고 계속</button></details>
    <p class="travel-trip-error" role="alert" hidden></p><p class="travel-place-saved" role="status"></p><button type="button" class="travel-secondary-button" data-travel-close>완료</button>
  </form>`;
  const noteForm = (item, selectedDay = defaultDayIndex()) => `<form id="travelNoteForm"><label>메모 제목<input name="title" maxlength="120" required placeholder="예: 수유·낮잠 시간"></label>${daySelect(item,selectedDay)}<label>시간 (선택)<input name="time" type="time"></label><label>내용<textarea name="note" maxlength="2000" placeholder="항공 시간, 낮잠, 준비할 일을 적어 주세요"></textarea></label><button type="submit" class="travel-primary-button">메모 추가</button></form>`;
  const itemForm = (item, entry) => `<form id="travelItemForm" data-item-id="${esc(entry.id)}"><label>${entry.type==='place'?'장소':'메모'} 제목<input name="title" maxlength="120" required value="${esc(entry.title)}"></label>${daySelect(item,entry.dayIndex)}<label>시간 (선택)<input name="time" type="time" value="${esc(entry.time || '')}"></label><label>메모<textarea name="note" maxlength="2000">${esc(entry.note || '')}</textarea></label><button type="submit" class="travel-primary-button">변경 저장</button></form>`;
  const statusBadge = () => data.isLocal() ? '<span class="travel-save-state">이 기기에 저장됨</span>' : '<span class="travel-save-state">가족과 공유됨</span>';
  const itemCount = item => item.items.length;
  const budgetSection = { key:'budget', title:'예상 예산', hint:'가족 합계와 포함·별도 항목을 적어 보세요.' };
  const decisionsSection = { key:'decisions', title:'예약 전에 정할 일', hint:'먼저 결정할 항목부터 한 줄씩 적어 보세요.', list:'ol' };
  const scheduleSection = { key:'schedule', title:'날짜별 일정안', hint:'하루의 주요 일정과 이동 시간을 한 줄씩 적어 보세요.', list:'ul' };
  const comparisonSections = [
    { key:'flight', title:'항공편', hint:'항공편 후보, 수하물, 확인한 가격을 적어 보세요.' },
    { key:'stay', title:'추천 숙소', hint:'숙소 후보와 객실, 요금, 취소 조건을 적어 보세요.' },
    { key:'transport', title:'렌터카·이동', hint:'렌터카, 카시트, 대중교통 옵션을 적어 보세요.' },
    { key:'parking', title:'발렛·주차', hint:'발렛과 주차 요금, 터미널과 예약 여부를 적어 보세요.' },
  ];
  const reportSections = [budgetSection, decisionsSection, ...comparisonSections, scheduleSection];
  const reportNotes = (item, section) => item.items.filter(entry =>
    entry.type === 'note' && entry.dayIndex == null && !entry.time && entry.title === section.title
  );
  const reportBody = (note, list) => {
    const paragraphs = [];
    const links = [];
    for (const line of note.split(/\r?\n/)) {
      const match = /^(?:(.+?)\s*[|:]\s*)?(https:\/\/\S+)$/i.exec(line.trim());
      if (match) {
        try {
          const url = new URL(match[2]);
          if (url.protocol === 'https:' && !url.username && !url.password) {
            links.push(`<li><a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(match[1]?.trim() || url.hostname)}</a></li>`);
            continue;
          }
        } catch { /* Keep an invalid link as text. */ }
      }
      paragraphs.push(line);
    }
    const lines = paragraphs.map(line => line.trim()).filter(Boolean);
    let body = '';
    if (list && lines.length) {
      body = `<${list} class="travel-report-list">${lines.map(line => `<li>${esc(line)}</li>`).join('')}</${list}>`;
    } else if (lines.length) {
      body = `<p class="travel-report-copy">${esc(paragraphs.join('\n').trim())}</p>`;
    }
    return `${body}${links.length ? `<ul class="travel-report-links">${links.join('')}</ul>` : ''}`;
  };
  const reportButton = (item, section, entry) => `<button type="button" class="travel-report-edit"
    data-travel-report-edit="${section.key}" data-trip-id="${esc(item.id)}"
    data-item-id="${esc(entry?.id || '')}" aria-label="${section.title} ${entry?'편집':'추가'}">${entry?'편집':'추가'}</button>`;
  const splitReportNote = note => {
    const lines = note.trim().split(/\r?\n/);
    const highlight = lines[0] && !/https?:\/\//i.test(lines[0]) ? lines.shift() : '';
    return { highlight, body:lines.join('\n') };
  };
  const reportCard = (item, section) => {
    const [first, ...others] = reportNotes(item, section);
    const { highlight, body } = splitReportNote(first?.note || '');
    return `<details class="travel-report-section" data-travel-report-section="${section.key}" data-trip-id="${esc(item.id)}">
      <summary class="travel-report-summary">
        <span class="travel-report-title">${section.title}</span>
        <span class="travel-report-highlight">${esc(highlight || (first ? '내용 보기' : '아직 계획이 없어요'))}</span>
      </summary>
      <div class="travel-report-detail">
        ${first ? reportBody(body) : `<p class="travel-report-empty">${section.hint}</p>`}
        ${reportButton(item, section, first)}
        ${others.map(entry => `<div class="travel-report-extra">${reportBody(entry.note)}${reportButton(item, section, entry)}</div>`).join('')}
      </div>
    </details>`;
  };
  const reportBlock = (item, section) => {
    const [first, ...others] = reportNotes(item, section);
    const { highlight, body } = section === budgetSection ? splitReportNote(first?.note || '') : { body:first?.note };
    return `<section class="travel-report-block" aria-labelledby="travelReport-${section.key}">
      <header class="travel-report-heading"><h3 id="travelReport-${section.key}">${section.title}</h3>${reportButton(item, section, first)}</header>
      ${highlight ? `<div class="travel-budget-preview"><strong>${esc(highlight)}</strong></div>` : ''}
      ${first ? reportBody(body, section.list) : `<p class="travel-report-empty">${section.hint}</p>`}
      ${others.map(entry => `<div class="travel-report-extra">${reportBody(entry.note, section.list)}${reportButton(item, section, entry)}</div>`).join('')}
    </section>`;
  };
  const reportForm = (item, section, entry) => `<form id="travelReportForm" data-trip-id="${esc(item.id)}"
    data-section="${section.key}" data-item-id="${esc(entry?.id || '')}">
    <label>내용<textarea name="note" rows="9" maxlength="2000" required>${esc(entry?.note || '').replace(/^\n/, '&#10;')}</textarea></label>
    <p class="travel-muted-copy">${comparisonSections.includes(section) ? '첫 줄에 핵심을 적으면 접힌 상태에서도 보여요. ' : section.list ? '항목마다 줄을 바꿔 주세요. ' : '첫 줄에 예상 합계를 적어 주세요. '}출처 링크는 새 줄에 ‘사이트 이름 | https://주소’로 적어 주세요.</p>
    <p class="travel-trip-error" role="alert" hidden></p>
    <button type="submit" class="travel-primary-button">저장</button>
  </form>`;
  const planOverview = item => {
    if (!item) return `<section class="travel-plan" aria-label="여행 계획"><p class="travel-plan-empty">예정된 여행이 없어요. 새 여행을 만들어 가족과 계획을 공유할 수 있어요.</p></section>`;
    const dayCount = days(item).length;
    const length = dayCount > 1 ? `${dayCount - 1}박 ${dayCount}일` : dayCount ? '당일' : '날짜 확인 필요';
    const year = item.startDate.slice(0, 4);
    const end = item.startDate !== item.endDate ? ` – ${item.endDate.startsWith(year) ? '' : `${esc(item.endDate.slice(0, 4))}년 `}${esc(fmtDate(item.endDate))}` : '';
    return `<section class="travel-plan" aria-labelledby="travelPlanTitle">
      <header class="travel-plan-hero">
        <div class="travel-plan-head">
          <h2 id="travelPlanTitle">${esc(item.title)}</h2>
          <button class="travel-secondary-button" type="button" data-travel-open-itinerary="${esc(item.id)}">일정 기록</button>
        </div>
        <div class="travel-plan-meta"><span>${esc(year)}년 ${esc(fmtDate(item.startDate))}${end} · <span class="travel-plan-duration">${length}</span></span>${statusBadge()}</div>
        ${item.intro ? `<p class="travel-plan-intro">${esc(item.intro)}</p>` : ''}
      </header>
      ${reportBlock(item, budgetSection)}
      <section class="travel-report-comparisons" aria-labelledby="travelComparisonsTitle">
        <h3 id="travelComparisonsTitle">항공·숙소·교통 비교</h3>
        <div class="travel-report-grid">${comparisonSections.map(section => reportCard(item, section)).join('')}</div>
      </section>
      ${reportBlock(item, decisionsSection)}
      ${reportBlock(item, scheduleSection)}
    </section>`;
  };
  const dateTabs = item => `<nav class="travel-day-tabs" aria-label="여행 날짜"><button type="button" class="${current.tab==='inbox'?'active':''}" aria-pressed="${current.tab==='inbox'}" data-travel-tab="inbox"><small>미정</small><strong>보관함</strong><span>${item.items.filter(entry=>entry.dayIndex==null).length}</span></button><button type="button" class="${current.tab==='all'?'active':''}" aria-pressed="${current.tab==='all'}" data-travel-tab="all"><small>전체</small><strong>모든 기록</strong><span>${item.items.length}</span></button>${days(item).map((date,index)=>`<button type="button" class="${current.tab===`day-${index}`?'active':''}" aria-pressed="${current.tab===`day-${index}`}" data-travel-tab="day-${index}"><small>${dayLabel(item,index)}</small><strong>${esc(fmtDate(date))}</strong><span>${item.items.filter(entry=>entry.dayIndex===index).length}</span></button>`).join('')}</nav>`;
  const itemCard = (item, entry, index, count) => {
    const number = entry.type === 'place' ? dayPlaces(item, entry.dayIndex).findIndex(place => place.id === entry.id) + 1 : null;
    const moveOptions = `<option value="" ${entry.dayIndex == null ? 'selected' : ''}>보관함 (날짜 미정)</option>${days(item).map((date,day)=>`<option value="${day}" ${entry.dayIndex===day?'selected':''}>${dayLabel(item,day)} · ${esc(fmtDate(date))}</option>`).join('')}`;
    return `<article class="travel-itinerary-item${current.selectedIds.has(entry.id)?' selected':''}" data-travel-item="${esc(entry.id)}"><div class="travel-item-leading">${current.selecting&&entry.type==='place'?`<label class="travel-place-selection"><input type="checkbox" data-travel-select-place="${esc(entry.id)}" aria-label="${esc(entry.title)} 선택" ${current.selectedIds.has(entry.id)?'checked':''} ${current.bulkBusy?'disabled':''}></label>`:''}${number == null ? '' : `<span class="travel-item-number" aria-hidden="true">${number}</span>`}</div><button class="travel-item-main" type="button" data-travel-edit-item="${esc(entry.id)}" aria-label="${esc(entry.title)} 기록 편집"><span class="travel-item-meta">${entry.type==='place'?'장소':'메모'}${entry.time?` · ${esc(entry.time)}`:''}</span><strong>${esc(entry.title)}</strong><small>${entry.type==='place' ? esc(entry.place?.address || entry.address || '위치 미지정') : esc(entry.note || '내용을 추가해 주세요')}</small>${entry.type==='place'&&entry.visited?'<em class="travel-visited">방문함</em>':''}</button><div class="travel-item-actions">${entry.type==='place'?`<button type="button" class="travel-visited-toggle" data-travel-visited="${esc(entry.id)}" aria-pressed="${Boolean(entry.visited)}" aria-label="${esc(entry.title)} 방문 ${entry.visited?'완료':'전'}">${entry.visited?'방문함':'방문 체크'}</button>`:''}<details class="travel-item-more"><summary aria-label="${esc(entry.title)} 더보기">더보기</summary><div class="travel-item-menu"><div class="travel-item-order"><button type="button" data-travel-reorder="up" data-travel-reorder-id="${esc(entry.id)}" aria-label="${esc(entry.title)} 위로 이동" ${index===0?'disabled':''}>위로</button><button type="button" data-travel-reorder="down" data-travel-reorder-id="${esc(entry.id)}" aria-label="${esc(entry.title)} 아래로 이동" ${index===count-1?'disabled':''}>아래로</button></div><label>날짜 이동<select data-travel-move-select="${esc(entry.id)}">${moveOptions}</select></label><button type="button" data-travel-move="${esc(entry.id)}">이동</button><button type="button" class="travel-delete-action" data-travel-delete="${esc(entry.id)}">삭제</button></div></details></div></article>`;
  };
  const groupMarkup = (item, index, shownItems) => {
    const entries=item.items.filter(entry=>index==null?entry.dayIndex==null:entry.dayIndex===index).sort(itineraryOrder);
    const visible=entries.map((entry,entryIndex)=>shownItems.has(entry)?itemCard(item,entry,entryIndex,entries.length):'').join('');
    if(!visible&&(current.itineraryQuery.trim()||current.itineraryStatus!=='all'))return '';
    return `<section class="travel-day-group${index==null?' travel-inbox-group':''}"><header><div><p class="eyebrow">${index==null?'INBOX':dayLabel(item,index)}</p><h3>${index==null?'날짜 미정 보관함':esc(fmtDate(days(item)[index]))}</h3></div><button type="button" class="travel-secondary-button small" data-travel-add-place ${index==null?'data-travel-inbox':'data-travel-day-index="'+index+'"'}>＋ 장소</button></header>${visible?visible:'<p class="travel-inline-empty">아직 기록이 없어요. 장소나 메모를 추가해 보세요.</p>'}</section>`;
  };
  const listMarkup = item => {
    const shownItems=new Set(activeItems(item));
    if(!shownItems.size&&(current.itineraryQuery.trim()||current.itineraryStatus!=='all'))return '<div class="travel-itinerary-empty"><p role="status">검색 조건에 맞는 기록이 없어요.</p><button type="button" class="travel-secondary-button" data-travel-itinerary-clear>검색 조건 지우기</button></div>';
    return current.tab==='all'?days(item).map((_,index)=>groupMarkup(item,index,shownItems)).join('')+groupMarkup(item,null,shownItems):groupMarkup(item,current.tab==='inbox'?null:Number(current.tab.slice(4)),shownItems);
  };
  const itineraryFilters = () => `<div class="travel-itinerary-filters"><label>일정 검색<input type="search" data-travel-itinerary-query value="${esc(current.itineraryQuery)}" placeholder="제목, 주소, 메모 검색" autocomplete="off"></label><label>방문 상태<select data-travel-itinerary-status><option value="all" ${current.itineraryStatus==='all'?'selected':''}>모든 기록</option><option value="visited" ${current.itineraryStatus==='visited'?'selected':''}>방문함</option><option value="unvisited" ${current.itineraryStatus==='unvisited'?'selected':''}>방문 전</option></select></label></div>`;
  const editor = item => {
    const shownItems = activeItems(item);
    const dayIndex = defaultDayIndex();
    return `<section class="travel-workspace"><header class="travel-workspace-head"><div><span class="travel-destination-kicker">${esc(item.destinationLabel)}</span><h2>${esc(item.title)}</h2><p>${fmtDate(item.startDate)} – ${fmtDate(item.endDate)} · ${itemCount(item)}개 기록</p></div><div class="travel-workspace-actions">${statusBadge(item)}<button class="travel-primary-button" type="button" data-travel-add-place>＋ 장소 추가</button><button class="travel-secondary-button" type="button" data-travel-edit>여행 정보</button></div></header>${dateTabs(item)}${itineraryFilters()}<p class="travel-itinerary-count" role="status">현재 조건에 맞는 기록 ${shownItems.length}개</p><div class="travel-itinerary-layout"><section class="travel-itinerary-list"><div class="travel-card-heading"><div><h3>${current.tab==='all'?'날짜별 일정':current.tab==='inbox'?'보관함':`일정 기록`}</h3></div><div class="travel-list-actions"><button class="travel-primary-button small" type="button" data-travel-add-place ${current.tab==='inbox'?'data-travel-inbox':dayIndex==null?'':'data-travel-day-index="'+dayIndex+'"'}>＋ 장소</button><button class="travel-secondary-button small" type="button" data-travel-add-note ${current.tab==='inbox'?'data-travel-inbox':dayIndex==null?'':'data-travel-day-index="'+dayIndex+'"'}>＋ 메모</button></div></div><section class="travel-bulk-editor${current.selecting?' selecting':''}" data-travel-bulk aria-label="여러 장소 편집">${bulkToolbar(item)}</section>${listMarkup(item)}</section></div><footer class="travel-workspace-footer"><button class="travel-secondary-button" type="button" data-travel-archive>여행 보관하기</button></footer></section>`;
  };
  const pageNavigation = () => `<nav class="travel-page-nav" aria-label="여행 화면"><button type="button" data-travel-page="plan" aria-pressed="${current.page==='plan'}">준비 보고서</button><button type="button" data-travel-page="manage" aria-pressed="${current.page==='manage'}">여행 목록</button></nav>`;
  const featuredTrip = () => {
    const trips = data.getTrips();
    const now = new Date();
    return management.selectTrips(trips, { filter:'ongoing', now })[0] ||
      management.selectTrips(trips, { filter:'upcoming', now })[0];
  };
  const render = () => {
    if(!view)return;
    const scrollY=window.scrollY||0, previousTab=view.dataset.renderedTab;
    const openedReports = new Set([...view.querySelectorAll('[data-travel-report-section][open]')].map(node => `${node.dataset.tripId}/${node.dataset.travelReportSection}`));
    const previousFilters=$('.travel-itinerary-filters',view),previousFocus=document.activeElement;
    const focusedFilter=previousFilters?.contains(previousFocus);
    const selection=focusedFilter&&previousFocus.matches('[data-travel-itinerary-query]')?[previousFocus.selectionStart,previousFocus.selectionEnd]:null;
    const previousDateScroll=$('.travel-day-tabs',view)?.scrollLeft;
    const active=current.page==='manage'?trip():null;
    if(active){
      const available=new Set(active.items.filter(entry=>entry.type==='place').map(entry=>entry.id));
      for(const id of current.selectedIds)if(!available.has(id))current.selectedIds.delete(id);
      if(current.tab==='all'&&active.items.length===0)current.tab='day-0';
      if(current.tab.startsWith('day-')&&(!Number.isInteger(Number(current.tab.slice(4)))||Number(current.tab.slice(4))>=days(active).length))current.tab=days(active).length?'day-0':'all';
    }
    if($('#travelModal',view)?.open)closeModal();
    let content;
    if (current.page === 'plan') content = planOverview(trip() || featuredTrip());
    else if (active) content = `<div class="travel-plan-head"><button type="button" class="travel-secondary-button travel-back" data-travel-back>← 여행 목록</button><button type="button" class="travel-secondary-button travel-back" data-travel-show-plan>준비 보고서</button></div>${editor(active)}`;
    else content = management.render(data.getTrips({ includeArchived:true }), current);
    view.innerHTML=`<div class="travel-page-controls">${pageNavigation()}<button class="travel-primary-button small" type="button" data-travel-new>＋ 새 여행</button></div>${content}${modalShell()}`;
    view.querySelectorAll('[data-travel-report-section]').forEach(node => {
      node.open = openedReports.has(`${node.dataset.tripId}/${node.dataset.travelReportSection}`);
    });
    const nextFilters=$('.travel-itinerary-filters',view);
    if(previousFilters&&nextFilters){
      nextFilters.replaceWith(previousFilters);
      const query=$('[data-travel-itinerary-query]',view),status=$('[data-travel-itinerary-status]',view);
      if(query.value!==current.itineraryQuery)query.value=current.itineraryQuery;
      status.value=current.itineraryStatus;
      query.disabled=status.disabled=current.bulkBusy;
      if(focusedFilter){previousFocus.focus({preventScroll:true});if(selection)previousFocus.setSelectionRange(...selection);}
    }
    if(current.bulkBusy)$('.travel-workspace',view)?.querySelectorAll('button,input,select').forEach(control=>control.disabled=true);
    view.dataset.renderedTab=current.tab;
    const dateStrip=$('.travel-day-tabs',view);
    if(dateStrip&&previousDateScroll!=null&&previousTab===current.tab)dateStrip.scrollLeft=previousDateScroll;
    else if(dateStrip){const selected=dateStrip.querySelector('[aria-pressed="true"]');if(selected)selected.scrollIntoView({block:'nearest',inline:'center',behavior:'instant'});}
    window.scrollTo?.(0,scrollY);
    applyVisibility();
  };
  const placeAlreadyAdded = place => Boolean(place.providerId && trip()?.items.some(entry=>entry.place?.provider===place.provider && entry.place?.providerId===place.providerId));
  const updateModalResults = (result, query) => {
    const target=$('#travelPlaceResults',view); if(!target)return;
    if(result.status!=='ok' || !result.items?.length){target.innerHTML=`<p class="travel-search-message">${esc(result.message || `‘${query}’ 검색 결과가 없어요. 지역이나 장소 이름을 바꿔 보세요.`)}</p>`;return;}
    target.innerHTML=`<p class="travel-form-hint">카카오 장소 검색 · 누르면 바로 추가돼요.</p>${result.items.map(place=>`<button type="button" class="travel-place-result" data-place-result="${esc(JSON.stringify(place))}" ${placeAlreadyAdded(place)?'disabled':''}><span><strong>${esc(place.name)}</strong><small>${esc(place.address || '주소 미정')}</small></span><span class="travel-place-add">${placeAlreadyAdded(place)?'추가됨':'＋ 추가'}</span></button>`).join('')}`;
  };
  const search = async category => {
    const form=$('#travelPlaceForm',view); if(!form)return;
    const query=[form.elements.region.value.trim(),category || form.elements.query.value.trim()].filter(Boolean).join(' ');
    if(!category&&!form.elements.query.value.trim())return;
    const request=++current.searchRequest;
    form.querySelectorAll('[data-travel-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.travelCategory===category)));
    const target=form.querySelector('#travelPlaceResults'); target.innerHTML='<p class="travel-search-message">장소를 찾고 있어요…</p>';
    try{const result=await data.searchPlaces(query,{limit:10});if(request===current.searchRequest&&form.isConnected)updateModalResults(result,query);}
    catch{if(request===current.searchRequest&&form.isConnected)updateModalResults({status:'error',message:'장소를 찾지 못했어요. 다시 검색해 주세요.'},query);}
  };
  const preparePlaceSearch = async () => {
    const form=$('#travelPlaceForm',view); if(!form)return;
    try{
      const result=await data.searchPlaces('',{action:'status'}); if(!form.isConnected)return;
      const available=result.status==='ok';
      form.querySelector('.travel-place-discovery').hidden=!available;
      form.querySelector('.travel-manual-place').open=!available;
      form.querySelector('.travel-place-status').textContent=available?'지역과 종류를 고르고, 다녀온 곳을 눌러 주세요.':result.message || '장소 검색을 연결 중이에요. 지금은 이름만으로 추가할 수 있어요.';
      if(available)await search('관광지');
    }catch{if(form.isConnected){form.querySelector('.travel-place-status').textContent='장소 검색에 연결하지 못했어요. 이름으로 추가하거나 잠시 후 다시 열어 주세요.';form.querySelector('.travel-manual-place').open=true;}}
  };
  const savePlace = async (form, selected, button) => {
    if(current.placeSaving || button?.disabled || selected&&placeAlreadyAdded(selected))return;
    const values=Object.fromEntries(new FormData(form).entries()),title=String(selected?.name || values.title || '').trim();
    const error=form.querySelector('.travel-trip-error'),saved=form.querySelector('.travel-place-saved');
    error.hidden=true;saved.textContent='';
    if(!title){error.textContent='장소 이름을 적어 주세요.';error.hidden=false;form.elements.title.focus();return;}
    const active=trip();if(!active)return;
    const controls=[...form.querySelectorAll('input,select,textarea,button')].filter(control=>!control.disabled);
    current.placeSaving=true;form.setAttribute('aria-busy','true');controls.forEach(control=>control.disabled=true);
    let success=false;
    try{
      const place=selected || {provider:'manual',providerId:null,name:title,address:values.address || '',lat:null,lng:null,attribution:null};
      await data.addPlace(active.id,{title,place,dayIndex:values.dayIndex===''?null:Number(values.dayIndex),visited:values.visited==='true',time:selected?null:values.time||null,note:selected?'':values.note||''});
      success=true;
      if(form.isConnected){
        saved.textContent=`${title} 추가했어요. 계속 추가할 수 있어요.`;
        if(button)button.querySelector('.travel-place-add').textContent='추가됨';
        else {for(const name of ['title','address','time','note'])form.elements[name].value='';}
      }
    }catch(reason){if(form.isConnected){error.textContent=reason.message||'저장하지 못했어요. 다시 시도해 주세요.';error.hidden=false;}}
    finally{current.placeSaving=false;form.removeAttribute('aria-busy');controls.forEach(control=>control.disabled=false);if(success&&button)button.disabled=true;if(success&&!button&&form.isConnected)form.elements.title.focus();if(!form.isConnected)render();}
  };
  const submit = async event => { const form=event.target; if(!(form instanceof HTMLFormElement))return; event.preventDefault(); const values=Object.fromEntries(new FormData(form).entries()); if(form.id==='travelBulkForm')return applyBulk(event.submitter?.dataset.travelBulkAction); if(current.bulkBusy)return; const errorNotice=form.querySelector('.travel-trip-error'); if(errorNotice)errorNotice.hidden=true; if(form.id==='travelTripForm'){values.destinationCustom=resolveDestination(values);values.destination='';} const active=trip(); try{
    if(form.id==='travelReportForm') return await saveReport(form, values.note);
    if(form.id==='travelTripForm'){ const destination=String(values.destinationCustom||values.destination||'').trim(); if(!destination)throw new Error('여행지를 선택하거나 직접 입력해 주세요.'); if(current.editingId&&active){ try{ await data.updateTrip(active.id,{title:values.title,destinationLabel:destination,destination,startDate:values.startDate,endDate:values.endDate,intro:values.intro}); }catch(error){ if(error.code==='OUT_OF_RANGE'&&window.confirm('기간 밖에 있는 기록을 보관함으로 옮기고 날짜를 줄일까요?')) await data.moveOutOfRangeToInbox(active.id,{title:values.title,destinationLabel:destination,destination,startDate:values.startDate,endDate:values.endDate,intro:values.intro}); else throw error; } } else { const created=await data.createTrip({title:values.title,destinationLabel:destination,destination,startDate:values.startDate,endDate:values.endDate,intro:values.intro}); clearSelection(); clearItineraryFilters(); current.page='plan'; current.tripId=created.id; current.tab='all'; } current.editingId=null; closeModal(); render(); return; }
    if(!active)return;
    if(form.id==='travelPlaceForm')return savePlace(form);
    if(form.id==='travelNoteForm'){ await data.addNote(active.id,{title:values.title,dayIndex:values.dayIndex===''?null:Number(values.dayIndex),time:values.time||null,note:values.note}); closeModal(); render(); return; }
    if(form.id==='travelItemForm'){ await data.updateItem(active.id,form.dataset.itemId,{title:values.title,dayIndex:values.dayIndex===''?null:Number(values.dayIndex),time:values.time||null,note:values.note}); closeModal(); render(); }
  }catch(error){ if(errorNotice){errorNotice.textContent=error.message||'저장하지 못했어요.';errorNotice.hidden=false;}else window.alert(error.message||'저장하지 못했어요.'); } };
  const saveReport = async (form, value) => {
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    const note = value.trim();
    if (!note) throw new Error('내용을 적어 주세요.');
    const item = data.getTrip(form.dataset.tripId);
    const section = reportSections.find(section => section.key === form.dataset.section);
    if (!item || !section) throw new Error('여행 계획을 찾을 수 없어요.');
    const entries = reportNotes(item, section);
    const id = form.dataset.itemId;
    if (id ? !entries.some(entry => entry.id === id) : entries.length > 0) {
      throw new Error('항목이 바뀌었어요. 닫고 다시 열어 주세요.');
    }
    button.disabled = true;
    try {
      if (id) await data.updateItem(item.id, id, { note });
      else await data.addNote(item.id, { title:section.title, note });
      closeModal();
      render();
      $(`[data-travel-report-edit="${section.key}"]`,view)?.focus({ preventScroll:true });
    } finally {
      button.disabled = false;
    }
  };
  const click = async event => {
    const target=event.target.closest('button,a');
    if(!target)return;
    const active=trip();
    if(current.bulkBusy&&!target.matches('[data-travel-page],[data-travel-back]'))return;
    if(target.matches('[data-travel-bulk-start]')){clearSelection();current.selecting=true;return render();}
    if(target.matches('[data-travel-bulk-end]')){clearSelection();return render();}
    if(target.matches('[data-travel-bulk-clear]')){current.selectedIds.clear();current.bulkMessage='';return updateBulkView();}
    if(target.matches('[data-travel-bulk-visible]')){activeItems(active).filter(entry=>entry.type==='place').forEach(entry=>current.selectedIds.add(entry.id));current.bulkMessage='';return updateBulkView();}
    if(target.matches('[data-travel-itinerary-clear]')){clearItineraryFilters();render();$('[data-travel-itinerary-query]',view)?.focus();return;}
    if(target.matches('[data-travel-close]')){closeModal();render();return;}
    if(target.matches('[data-travel-new]')){clearItineraryFilters();render();current.editingId=null;current.modalMode='trip';return showModal('새 여행',tripForm());}
    if(target.matches('[data-travel-page]')){clearSelection();clearItineraryFilters();current.page=target.dataset.travelPage;current.tripId=null;return render();}
    if(target.matches('[data-travel-back]')){clearSelection();clearItineraryFilters();current.tripId=null;return render();}
    if(target.matches('[data-travel-filter]')){current.filter=target.dataset.travelFilter;view.querySelectorAll('[data-travel-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button===target)));$('[data-travel-results]',view).innerHTML=management.renderResults(data.getTrips({includeArchived:true}),current);return;}
    if(target.matches('[data-travel-open]')){clearSelection();clearItineraryFilters();current.page='plan';current.tripId=target.dataset.travelOpen;render();$('[data-travel-open-itinerary]',view)?.focus();return;}
    if(target.matches('[data-travel-open-itinerary]')){clearSelection();clearItineraryFilters();current.page='manage';current.tripId=target.dataset.travelOpenItinerary;current.tab='all';render();$('.travel-back',view)?.focus();return;}
    if(target.matches('[data-travel-show-plan]')){clearSelection();clearItineraryFilters();current.page='plan';render();$('[data-travel-open-itinerary]',view)?.focus();return;}
    if (target.matches('[data-travel-report-edit]')) {
      const item = data.getTrip(target.dataset.tripId);
      const section = reportSections.find(section => section.key === target.dataset.travelReportEdit);
      if (!item || !section) return;
      const entry = reportNotes(item, section).find(entry => entry.id === target.dataset.itemId);
      return showModal(section.title, reportForm(item, section, entry));
    }
    if(target.matches('[data-travel-restore]')){target.disabled=true;try{await data.restoreTrip(target.dataset.travelRestore);current.filter='all';render();}finally{target.disabled=false;}return;}
    if(target.matches('[data-travel-search]'))return search();
    if(target.matches('[data-travel-category]'))return search(target.dataset.travelCategory);
    if(target.matches('[data-place-result]'))return savePlace(target.closest('form'),JSON.parse(target.dataset.placeResult),target);
    if(target.matches('[data-travel-external]'))return;
    if(!active)return;
    if(target.matches('[data-travel-edit]')){current.editingId=active.id;return showModal('여행 정보',tripForm(active));}
    if(target.matches('[data-travel-tab]')){current.tab=target.dataset.travelTab;return render();}
    if(target.matches('[data-travel-add-place]')){const day=target.hasAttribute('data-travel-inbox')?null:target.hasAttribute('data-travel-day-index')?Number(target.dataset.travelDayIndex):defaultDayIndex();current.modalMode='place';showModal('장소 추가',placeForm(active,day));return preparePlaceSearch();}
    if(target.matches('[data-travel-add-note]')){const day=target.hasAttribute('data-travel-inbox')?null:target.hasAttribute('data-travel-day-index')?Number(target.dataset.travelDayIndex):defaultDayIndex();current.modalMode='note';return showModal('메모 추가',noteForm(active,day));}
    if(target.matches('[data-travel-archive]')){if(window.confirm('이 여행을 보관함으로 옮길까요?')){await data.archiveTrip(active.id);clearSelection();clearItineraryFilters();current.tripId=null;current.tab='all';render();}return;}
    if(target.matches('[data-travel-edit-item]')){const entry=active.items.find(item=>item.id===target.dataset.travelEditItem);if(entry)return showModal(entry.type==='place'?'장소 편집':'메모 편집',itemForm(active,entry));}
    if(target.matches('[data-travel-reorder]')){await data.reorderItem(active.id,target.dataset.travelReorderId,target.dataset.travelReorder);render();return;}
    if(target.matches('[data-travel-visited]')){await data.toggleVisited(active.id,target.dataset.travelVisited);render();return;}
    if(target.matches('[data-travel-delete]')){if(window.confirm('이 기록을 삭제할까요?')){await data.deleteItem(active.id,target.dataset.travelDelete);render();}return;}
  };
  const applyVisibility = () => { const activeView=window.FAMILY_APP_STATE?.activeView; if(view)view.hidden=Boolean(activeView&&activeView!=='travel'); if(view)$('#travelModal',view)?.setAttribute('hidden',''); };
  const handlePlannerControls = async event => {
    const target = event.target.closest?.('button,summary');
    if (event.target.closest?.('.travel-item-more') && !event.target.closest('.travel-item-more button,.travel-item-more summary')) { event.stopImmediatePropagation(); return; }
    if (!target) return;
    if(current.bulkBusy&&target.closest('.travel-workspace')){event.preventDefault();event.stopImmediatePropagation();return;}
    if (target.matches('.travel-item-more summary')) { event.stopImmediatePropagation(); return; }
    const add = target.closest('[data-travel-add-place],[data-travel-add-note]');
    if (add) {
      event.preventDefault(); event.stopImmediatePropagation();
      const selectedDay = add.hasAttribute('data-travel-inbox') ? null : add.hasAttribute('data-travel-day-index') ? Number(add.dataset.travelDayIndex) : defaultDayIndex();
      if (add.matches('[data-travel-add-place]')) { current.modalMode='place'; showModal('장소 추가',placeForm(trip(),selectedDay)); await preparePlaceSearch(); }
      else { current.modalMode='note'; showModal('메모 추가',noteForm(trip(),selectedDay)); }
      return;
    }
    if (target.matches('[data-travel-move]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      const active=trip(), picker=target.closest('.travel-item-more')?.querySelector('[data-travel-move-select]');
      if (!active || !picker) return;
      await data.moveItem(active.id,target.dataset.travelMove,picker.value===''?null:Number(picker.value));
      render();
    }
  };
  const ensure = () => {
    view=$('#travelView');
    if(!view){view=document.createElement('div');view.id='travelView';view.hidden=true;document.querySelector('main')?.appendChild(view);}
    if(!view.dataset.bound){
      view.dataset.bound='true';
      view.addEventListener('click',event=>handlePlannerControls(event).catch(error=>window.alert(error.message||'변경하지 못했어요.')),true);
      view.addEventListener('click',event=>click(event).catch(error=>window.alert(error.message||'변경하지 못했어요.')));
      view.addEventListener('click',event=>{if(event.target.matches('.travel-modal-backdrop')){closeModal();render();}});
      view.addEventListener('submit',submit);
      view.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&event.target.matches('#travelPlaceForm input[name="query"]')){event.preventDefault();search();}});
      view.addEventListener('change',event=>{
        const target=event.target;
        if(current.bulkBusy)return;
        if(target.matches('[data-travel-itinerary-status]')){current.itineraryStatus=target.value;render();return;}
        if(target.matches('[data-travel-select-place]')){const id=target.dataset.travelSelectPlace;if(!trip()?.items.some(entry=>entry.id===id&&entry.type==='place'))return;target.checked?current.selectedIds.add(id):current.selectedIds.delete(id);current.bulkMessage='';updateBulkView();}
        if(target.matches('[data-travel-bulk-day]')){current.bulkDay=target.value;const move=$('[data-travel-bulk-action="move"]',view);if(move)move.disabled=!current.selectedIds.size||target.value==='choose';}
      });
      view.addEventListener('input',event=>{if(event.target.matches('[data-travel-itinerary-query]')){if(current.bulkBusy||event.isComposing)return;current.itineraryQuery=event.target.value;render();return;}if(!event.target.matches('[data-travel-query]'))return;current.query=event.target.value;const results=$('[data-travel-results]',view);if(results)results.innerHTML=management.renderResults(data.getTrips({includeArchived:true}),current);});
    }
    render();
    if(!data.isLocal()&&!refreshPromise){refreshPromise=data.refresh().then(()=>{render();}).catch(error=>{if(view&&window.FAMILY_APP_STATE?.activeView==='travel')window.alert(error.message||'가족 여행을 불러오지 못했어요.');}).finally(()=>{refreshPromise=null;});}
  };
  const baseSwitch=window.switchView;
  window.switchView=function travelSwitch(next){if(next!=='travel'){clearSelection();if($('#travelModal',view)?.open)closeModal();view?.setAttribute('hidden','');return baseSwitch(next);}ensure();if(window.FAMILY_APP_STATE)window.FAMILY_APP_STATE.activeView='travel';document.querySelectorAll('.view-tab[data-view]').forEach(tab=>{const selected=tab.dataset.view==='travel';tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;});document.querySelector('main')?.querySelectorAll(':scope > [id$="View"]').forEach(other=>{if(other!==view)other.hidden=true;});$('#addEventButton')?.setAttribute('hidden','');view.hidden=false;};
  window.switchView.__familyTravelInstalled=true; window.FAMILY_TRAVEL_READY=true;
  window.addEventListener('family:travel-change',()=>{if(!current.placeSaving&&view&&window.FAMILY_APP_STATE?.activeView==='travel')render();}); window.addEventListener('familycontextchange',()=>{clearSelection();clearItineraryFilters();current.page='plan';current.query='';current.filter='all';current.tripId=null;current.tab='all';render();refreshPromise=null;if(view&&window.FAMILY_APP_STATE?.activeView==='travel')ensure();}); ensure();
  window.addEventListener('family:travel-remote-change',()=>{ if(!view||window.FAMILY_APP_STATE?.activeView!=='travel'||!$('#travelModal',view)?.hidden)return; data.refresh().then(()=>render()).catch(()=>{}); });
})();
