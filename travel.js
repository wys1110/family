(() => {
  if (window.FAMILY_TRAVEL_READY) return;
  const data = window.FAMILY_TRAVEL_DATA;
  const maps = window.FAMILY_TRAVEL_MAP;
  const management = window.FAMILY_TRAVEL_MANAGEMENT;
  if (!data || !maps || !management) return;
  const map = maps.create(), historyMap = maps.create();
  let historyItems = [], historyActiveId = null;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  const $ = (selector, root = document) => root.querySelector(selector);
  const fmtDate = value => { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { month:'short', day:'numeric', weekday:'short' }).format(date); };
  const dateList = (start, end) => { const result=[]; const cursor=new Date(`${start}T12:00:00`); const last=new Date(`${end}T12:00:00`); while(cursor<=last && result.length<366){ result.push(cursor.toISOString().slice(0,10)); cursor.setDate(cursor.getDate()+1); } return result; };
  const days = trip => dateList(trip.startDate, trip.endDate);
  const dayLabel = (trip, index) => `DAY ${index + 1}`;
  const current = { page:'manage', query:'', filter:'all', itineraryQuery:'', itineraryStatus:'all', selecting:false, selectedIds:new Set(), bulkDay:'choose', bulkBusy:false, bulkMessage:'', bulkError:false, tripId:null, tab:'all', layout:'map', activeItemId:null, editingId:null, modalMode:null, selectedPlace:null, searchRequest:0 };
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
  const clearItineraryFilters = () => {current.itineraryQuery='';current.itineraryStatus='all';current.activeItemId=null;};
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
  const destinationOptions = value => `<option value="" ${value ? '' : 'selected'}>목록에서 선택 (선택 사항)</option>${value && !destinationGroups.some(([,items])=>items.includes(value)) ? `<option value="${esc(value)}" selected>${esc(value)} (기존)</option>` : ''}${destinationGroups.map(([group,items])=>`<optgroup label="${group}">${items.map(item=>`<option value="${esc(item)}" ${item===value?'selected':''}>${esc(item)}</option>`).join('')}</optgroup>`).join('')}`;
  const resolveDestination = values => String(values.destinationCustom ?? '').trim() || String(values.destination ?? '').trim();
  const reconcileDestinationInputs = target => { const form=target.closest?.('#travelTripForm'); if(!form)return; const select=form.elements.destination,custom=form.elements.destinationCustom; if(target===select)custom.value=''; else if(target===custom)select.value=''; };
  document.addEventListener('change', event => reconcileDestinationInputs(event.target));
  document.addEventListener('input', event => reconcileDestinationInputs(event.target));
  const modalShell = () => `<dialog class="travel-modal" id="travelModal" aria-labelledby="travelModalTitle" hidden><div class="travel-modal-backdrop" data-travel-close></div><section class="travel-modal-panel" tabindex="-1" autofocus><header><div><p class="eyebrow">FAMILY TRAVEL ARCHIVE</p><h2 id="travelModalTitle">기록 추가</h2></div><button type="button" class="travel-modal-close" data-travel-close aria-label="닫기">×</button></header><div id="travelModalContent"></div></section></dialog>`;
  const showModal = (title, markup) => { const node=$('#travelModal',view); if(!node)return; node.querySelector('#travelModalTitle').textContent=title; node.querySelector('#travelModalContent').innerHTML=markup; if(!node.dataset.lifecycleBound){node.dataset.lifecycleBound='true';node.addEventListener('cancel',event=>{event.preventDefault();closeModal();});node.addEventListener('close',()=>{if(node.open||$('#travelModal',view)!==node)return;node.hidden=true;clearTravelViewport(node);current.modalMode=null;current.selectedPlace=null;});} if(window.visualViewport){clearTravelViewport(node);travelViewportListener=()=>{node.style.setProperty('--travel-viewport-height',`${window.visualViewport.height}px`);node.style.setProperty('--travel-viewport-top',`${window.visualViewport.offsetTop}px`);};window.visualViewport.addEventListener('resize',travelViewportListener);window.visualViewport.addEventListener('scroll',travelViewportListener);travelViewportListener();} node.hidden=false; node.showModal(); node.querySelector('.travel-modal-panel')?.focus(); };
  const closeModal = () => { const node=$('#travelModal',view); if(node){ if(node.open)node.close(); node.hidden=true; clearTravelViewport(node); } current.modalMode=null; current.selectedPlace=null; };
  const tripForm = item => `<form id="travelTripForm"><label>여행 이름<input name="title" maxlength="60" required placeholder="예: 도윤이와 첫 오키나와" value="${esc(item?.title || '')}"></label><label>여행지 (목록에서 선택하거나 아래에 직접 입력)<select name="destination">${destinationOptions(item?.destinationLabel || item?.destination || '')}</select></label><label>직접 입력 (선택)<input name="destinationCustom" maxlength="120" placeholder="목록에 없는 여행지도 입력할 수 있어요" value="${esc(item && !destinationGroups.some(([,items])=>items.includes(item.destinationLabel)) ? item.destinationLabel : '')}"></label><div class="travel-form-grid"><label>시작일<input type="date" name="startDate" required value="${esc(item?.startDate || '')}"></label><label>마지막 날<input type="date" name="endDate" required value="${esc(item?.endDate || '')}"></label></div><label>여행 한 줄 소개<textarea name="intro" maxlength="240" placeholder="우리 가족이 기억하고 싶은 여행을 적어 주세요">${esc(item?.intro || '')}</textarea></label><button type="submit" class="travel-primary-button">${item?'저장하기':'여행 만들기'}</button></form>`;
  const defaultDayIndex = () => current.tab.startsWith('day-') ? Number(current.tab.slice(4)) : null;
  const daySelect = (item, selectedDay = defaultDayIndex()) => `<label>날짜<select name="dayIndex"><option value="" ${selectedDay == null ? 'selected' : ''}>보관함 (날짜 미정)</option>${days(item).map((date,index)=>`<option value="${index}" ${selectedDay===index?'selected':''}>${dayLabel(item,index)} · ${esc(fmtDate(date))}</option>`).join('')}</select></label>`;
  const placeForm = (item, selectedDay = defaultDayIndex()) => `<form id="travelPlaceForm"><div class="travel-search-row"><input name="query" maxlength="120" placeholder="장소 이름이나 주소 검색" autocomplete="off"><button type="button" class="travel-secondary-button" data-travel-search>검색</button></div><div id="travelPlaceResults" class="travel-place-results" aria-live="polite"><p class="travel-muted-copy">검색 결과를 선택하면 위치와 출처가 함께 저장돼요.</p></div><div class="travel-manual-place"><p class="travel-form-hint">검색이 되지 않으면 이름과 주소를 직접 기록할 수 있어요. 위치가 없으면 지도 핀 없이 보관됩니다.</p><label>장소 이름<input name="title" maxlength="120" required placeholder="예: 추라우미 수족관"></label><label>주소 (선택)<input name="address" maxlength="240" placeholder="예: 424 Ishikawa, Motobu, Okinawa"></label>${daySelect(item,selectedDay)}<label>시간 (선택)<input name="time" type="time"></label><label>메모 (선택)<textarea name="note" maxlength="2000" placeholder="아이 컨디션, 주차, 예약 메모"></textarea></label><button type="submit" class="travel-primary-button">방문한 장소 남기기</button></div></form>`;
  const noteForm = (item, selectedDay = defaultDayIndex()) => `<form id="travelNoteForm"><label>메모 제목<input name="title" maxlength="120" required placeholder="예: 수유·낮잠 시간"></label>${daySelect(item,selectedDay)}<label>시간 (선택)<input name="time" type="time"></label><label>내용<textarea name="note" maxlength="2000" placeholder="항공 시간, 낮잠, 준비할 일을 적어 주세요"></textarea></label><button type="submit" class="travel-primary-button">메모 추가</button></form>`;
  const itemForm = (item, entry) => `<form id="travelItemForm" data-item-id="${esc(entry.id)}"><label>${entry.type==='place'?'장소':'메모'} 제목<input name="title" maxlength="120" required value="${esc(entry.title)}"></label>${daySelect(item,entry.dayIndex)}<label>시간 (선택)<input name="time" type="time" value="${esc(entry.time || '')}"></label><label>메모<textarea name="note" maxlength="2000">${esc(entry.note || '')}</textarea></label><button type="submit" class="travel-primary-button">변경 저장</button></form>`;
  const statusBadge = item => data.isLocal() ? '<span class="travel-save-state">이 기기에 저장됨</span>' : '<span class="travel-save-state">가족과 공유됨</span>';
  const itemCount = item => item.items.length;
  const pageHeader = () => `<header class="travel-page-header"><div><p class="eyebrow">FAMILY TRAVEL ARCHIVE</p><h2>우리 가족의 여행 지도</h2><p>여행을 찾고 관리하며, 다녀온 곳을 한눈에 돌아봐요.</p></div><button class="travel-primary-button" type="button" data-travel-new>＋ 새 여행</button></header>`;
  const historySummary = () => {
    const summary = data.summarizeTrips(data.getTrips({ includeArchived: true }));
    historyItems = summary.historyDestinations;
    const mapped = maps.placePoints(historyItems);
    const missing = historyItems.filter(item => !mapped.includes(item));
    const history = `<section class="travel-history-map"><h4>다녀온 여행지</h4>${mapped.length ? historyMap.render({items:historyItems,activeId:historyActiveId,kind:'history'}) : '<p class="travel-history-empty">위치가 있는 지난 여행 기록이 쌓이면 지도에 표시돼요.</p>'}${missing.length ? `<p class="travel-history-notice">위치 정보 없음: ${missing.map(item=>esc(item.title)).join(', ')} · 해당 여행에 위치가 있는 장소를 추가하면 지도에 표시돼요.</p>` : ''}</section>`;
    const maximum = Math.max(1, ...summary.topDestinations.map(item => item.trips));
    const destinations = summary.topDestinations.length
      ? `<ol class="travel-history-destinations">${summary.topDestinations.map(item => `<li><span class="travel-history-destination-name">${esc(item.name)}</span><span class="travel-history-bar-track" aria-hidden="true"><span style="width:${Math.round(item.trips / maximum * 100)}%"></span></span><span class="travel-history-destination-count">${item.trips}회 · ${item.nights}박</span></li>`).join('')}</ol>`
      : '<p class="travel-history-empty">지난 여행 기록이 쌓이면 여행지가 여기에 표시돼요.</p>';
    const invalidNotice = summary.invalidTrips ? `<p class="travel-history-notice" role="note">날짜가 누락되었거나 잘못된 여행 ${summary.invalidTrips}개는 집계에서 제외했어요.</p>` : '';
    return `<section class="travel-history-summary" aria-labelledby="travelHistoryTitle"><div class="travel-history-heading"><div><p class="eyebrow">TRAVEL HISTORY</p><h3 id="travelHistoryTitle">우리 가족 여행 요약</h3></div><p class="travel-history-basis">종료일이 지난 일정 기준 · 박수는 시작일과 종료일의 차이</p></div>${history}<div class="travel-history-stats"><article><strong>${summary.pastTrips}회</strong><span>지난 여행</span></article><article><strong>${summary.totalNights}박</strong><span>누적 박수</span></article><article><strong>${summary.destinations}곳</strong><span>여행지 수</span></article></div><p class="travel-history-plans"><span>진행 중 <strong>${summary.ongoingTrips}</strong></span><span>예정 <strong>${summary.upcomingTrips}</strong></span></p><div class="travel-history-destination-section"><h4>자주 간 여행지 <span>지난 여행 횟수 · 누적 박수</span></h4>${destinations}</div>${invalidNotice}</section>`;
  };
  const dateTabs = item => `<nav class="travel-day-tabs" aria-label="여행 날짜"><button type="button" class="${current.tab==='inbox'?'active':''}" aria-pressed="${current.tab==='inbox'}" data-travel-tab="inbox"><small>미정</small><strong>보관함</strong><span>${item.items.filter(entry=>entry.dayIndex==null).length}</span></button><button type="button" class="${current.tab==='all'?'active':''}" aria-pressed="${current.tab==='all'}" data-travel-tab="all"><small>전체</small><strong>모든 기록</strong><span>${item.items.length}</span></button>${days(item).map((date,index)=>`<button type="button" class="${current.tab===`day-${index}`?'active':''}" aria-pressed="${current.tab===`day-${index}`}" data-travel-tab="day-${index}"><small>${dayLabel(item,index)}</small><strong>${esc(fmtDate(date))}</strong><span>${item.items.filter(entry=>entry.dayIndex===index).length}</span></button>`).join('')}</nav>`;
  const itemCard = (item, entry, index, count) => {
    const number = entry.type === 'place' ? dayPlaces(item, entry.dayIndex).findIndex(place => place.id === entry.id) + 1 : null;
    const moveOptions = `<option value="" ${entry.dayIndex == null ? 'selected' : ''}>보관함 (날짜 미정)</option>${days(item).map((date,day)=>`<option value="${day}" ${entry.dayIndex===day?'selected':''}>${dayLabel(item,day)} · ${esc(fmtDate(date))}</option>`).join('')}`;
    return `<article class="travel-itinerary-item${current.selectedIds.has(entry.id)?' selected':''}${entry.id===current.activeItemId?' active':''}" data-map-item="${esc(entry.id)}"><div class="travel-item-leading">${current.selecting&&entry.type==='place'?`<label class="travel-place-selection"><input type="checkbox" data-travel-select-place="${esc(entry.id)}" aria-label="${esc(entry.title)} 선택" ${current.selectedIds.has(entry.id)?'checked':''} ${current.bulkBusy?'disabled':''}></label>`:''}${number == null ? '<span class="travel-note-mark" aria-hidden="true">✦</span>' : !map.placePoints([entry]).length ? `<span class="travel-item-number" aria-hidden="true">${number}</span>` : `<button type="button" class="travel-item-number" data-travel-select-item="${esc(entry.id)}" aria-label="${esc(entry.title)} 지도에서 보기">${number}</button>`}</div><button class="travel-item-main" type="button" data-travel-edit-item="${esc(entry.id)}" aria-label="${esc(entry.title)} 기록 편집"><span class="travel-item-meta">${entry.type==='place'?'장소':'메모'}${entry.time?` · ${esc(entry.time)}`:''}</span><strong>${esc(entry.title)}</strong><small>${entry.type==='place' ? esc(entry.place?.address || entry.address || '위치 미지정') : esc(entry.note || '내용을 추가해 주세요')}</small>${entry.type==='place'&&entry.visited?'<em class="travel-visited">방문함</em>':''}</button><div class="travel-item-actions">${entry.type==='place'?`<button type="button" class="travel-visited-toggle" data-travel-visited="${esc(entry.id)}" aria-pressed="${Boolean(entry.visited)}" aria-label="${esc(entry.title)} 방문 ${entry.visited?'완료':'전'}">${entry.visited?'방문함':'방문 체크'}</button>`:''}<details class="travel-item-more"><summary aria-label="${esc(entry.title)} 더보기">더보기</summary><div class="travel-item-menu"><div class="travel-item-order"><button type="button" data-travel-reorder="up" data-travel-reorder-id="${esc(entry.id)}" aria-label="${esc(entry.title)} 위로 이동" ${index===0?'disabled':''}>위로</button><button type="button" data-travel-reorder="down" data-travel-reorder-id="${esc(entry.id)}" aria-label="${esc(entry.title)} 아래로 이동" ${index===count-1?'disabled':''}>아래로</button></div><label>날짜 이동<select data-travel-move-select="${esc(entry.id)}">${moveOptions}</select></label><button type="button" data-travel-move="${esc(entry.id)}">이동</button><button type="button" class="travel-delete-action" data-travel-delete="${esc(entry.id)}">삭제</button></div></details></div></article>`;
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
  const routeUrl = item => { const places=activeItems(item).filter(entry=>entry.type==='place'&&entry.place?.address).map(entry=>entry.place.address).filter(Boolean); if(!places.length)return ''; if(places.length===1)return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(places[0])}`; return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(places[0])}&destination=${encodeURIComponent(places.at(-1))}${places.length>2?`&waypoints=${encodeURIComponent(places.slice(1,-1).join('|'))}`:''}`; };
  const editor = item => {
    const shownItems = activeItems(item);
    const mapItems = shownItems.filter(entry=>entry.type==='place');
    const dayIndex = defaultDayIndex();
    return `<section class="travel-workspace"><header class="travel-workspace-head"><div><span class="travel-destination-kicker">${esc(item.destinationLabel)}</span><h2>${esc(item.title)}</h2><p>${fmtDate(item.startDate)} – ${fmtDate(item.endDate)} · ${itemCount(item)}개 기록</p></div><div class="travel-workspace-actions">${statusBadge(item)}<button class="travel-secondary-button" type="button" data-travel-edit>여행 정보</button></div></header><div class="travel-planner-note"><span aria-hidden="true">✦</span><p>방문할 곳은 순서대로, 날짜가 없으면 보관함에 남겨요.</p></div>${dateTabs(item)}${itineraryFilters()}<p class="travel-itinerary-count" role="status">현재 조건에 맞는 기록 ${shownItems.length}개</p><div class="travel-layout-toggle" role="group" aria-label="여행 일정 보기"><button type="button" data-travel-layout="list" aria-pressed="${current.layout==='list'}">일정</button><button type="button" data-travel-layout="map" aria-pressed="${current.layout==='map'}">지도·일정</button></div><div class="travel-itinerary-layout" data-mobile-layout="${current.layout}"><section class="travel-map-card"><div class="travel-card-heading"><div><p class="eyebrow">FAMILY ROUTE</p><h3>${current.tab==='all'?'전체 장소':current.tab==='inbox'?'보관함 위치':`선택한 날짜의 장소`}</h3></div>${routeUrl(item)?`<a class="travel-secondary-button" href="${routeUrl(item)}" target="_blank" rel="noopener noreferrer">외부 지도 ↗</a>`:''}</div>${map.render({items:mapItems,activeId:current.activeItemId,grouped:current.tab==='all'})}</section><section class="travel-itinerary-list"><div class="travel-card-heading"><div><p class="eyebrow">ITINERARY</p><h3>${current.tab==='all'?'날짜별 일정':current.tab==='inbox'?'보관함':`일정 기록`}</h3></div><div class="travel-list-actions"><button class="travel-primary-button small" type="button" data-travel-add-place ${current.tab==='inbox'?'data-travel-inbox':dayIndex==null?'':'data-travel-day-index="'+dayIndex+'"'}>＋ 장소</button><button class="travel-secondary-button small" type="button" data-travel-add-note ${current.tab==='inbox'?'data-travel-inbox':dayIndex==null?'':'data-travel-day-index="'+dayIndex+'"'}>＋ 메모</button></div></div><section class="travel-bulk-editor${current.selecting?' selecting':''}" data-travel-bulk aria-label="여러 장소 편집">${bulkToolbar(item)}</section>${listMarkup(item)}</section></div><footer class="travel-workspace-footer"><button class="travel-secondary-button" type="button" data-travel-archive>여행 보관하기</button></footer></section>`;
  };
  const pageNavigation = () => `<nav class="travel-page-nav" aria-label="여행 화면"><button type="button" data-travel-page="summary" aria-pressed="${current.page==='summary'}">전체 요약</button><button type="button" data-travel-page="manage" aria-pressed="${current.page==='manage'}">여행 관리</button></nav>`;
  const render = () => {
    if(!view)return;
    const scrollY=window.scrollY||0, previousTab=view.dataset.renderedTab;
    const previousFilters=$('.travel-itinerary-filters',view),previousFocus=document.activeElement;
    const focusedFilter=previousFilters?.contains(previousFocus);
    const selection=focusedFilter&&previousFocus.matches('[data-travel-itinerary-query]')?[previousFocus.selectionStart,previousFocus.selectionEnd]:null;
    const previousMap=$('.travel-map-card .travel-leaflet-map',view);
    const previousHistoryMap=$('.travel-history-map .travel-leaflet-map',view);
    const previousDateScroll=$('.travel-day-tabs',view)?.scrollLeft;
    const active=current.page==='manage'?trip():null;
    if(active){
      const available=new Set(active.items.filter(entry=>entry.type==='place').map(entry=>entry.id));
      for(const id of current.selectedIds)if(!available.has(id))current.selectedIds.delete(id);
      if(current.tab==='all'&&active.items.length===0)current.tab='day-0';
      if(current.tab.startsWith('day-')&&(!Number.isInteger(Number(current.tab.slice(4)))||Number(current.tab.slice(4))>=days(active).length))current.tab=days(active).length?'day-0':'all';
      if(current.activeItemId&&!activeItems(active).some(entry=>entry.id===current.activeItemId))current.activeItemId=null;
    }
    if($('#travelModal',view)?.open)closeModal();
    const content=current.page==='summary'?historySummary():active?`<button type="button" class="travel-secondary-button travel-back" data-travel-back>← 여행 목록</button>${editor(active)}`:management.render(data.getTrips({includeArchived:true}),current);
    view.innerHTML=`${pageHeader()}${pageNavigation()}${content}${modalShell()}`;
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
    restoreHistoryMap(previousHistoryMap);
    const nextMap=$('.travel-map-card .travel-leaflet-map',view);
    if(previousMap&&nextMap)nextMap.replaceWith(previousMap);
    if(!nextMap)map.destroy();
    view.dataset.renderedTab=current.tab;
    const dateStrip=$('.travel-day-tabs',view);
    if(dateStrip&&previousDateScroll!=null&&previousTab===current.tab)dateStrip.scrollLeft=previousDateScroll;
    else if(dateStrip){const selected=dateStrip.querySelector('[aria-pressed="true"]');if(selected)selected.scrollIntoView({block:'nearest',inline:'center',behavior:'instant'});}
    window.scrollTo?.(0,scrollY);
    applyVisibility();
    mountMap();
    mountHistoryMap();
  };
  const selectMapItem = (id, fromCard = false) => {
    current.activeItemId=id;
    if(fromCard&&current.layout==='list'){current.layout='map';render();}
    view.querySelectorAll('.travel-itinerary-item').forEach(node=>node.classList.toggle('active',node.dataset.mapItem===id));
    mountMap(false,fromCard);
    const card=[...view.querySelectorAll('.travel-itinerary-item')].find(node=>node.dataset.mapItem===id);
    (fromCard ? $('.travel-map-card',view) : card)?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  };
  const mountMap = (retry = false, focus = false) => {
    const active=trip();
    if(!active||!view||view.hidden||!$('.travel-map-card',view)||current.layout==='list'&&window.matchMedia('(max-width: 767px)').matches)return;
    return map.mount($('.travel-map-card',view),{items:activeItems(active).filter(entry=>entry.type==='place'),activeId:current.activeItemId,grouped:current.tab==='all',scope:`${active.id}:${current.tab}`,center:[active.centerLat,active.centerLng],onSelect:selectMapItem,retry,focus});
  };
  const restoreHistoryMap = previous => {
    const next=$('.travel-history-map .travel-leaflet-map',view);
    if(previous&&next)next.replaceWith(previous);
    if(!next)historyMap.destroy();
  };
  const mountHistoryMap = (retry = false) => {
    if(!view||view.hidden||!$('.travel-history-map',view))return;
    return historyMap.mount($('.travel-history-map',view),{items:historyItems,kind:'history',activeId:historyActiveId,scope:'history',retry,onSelect:id=>{historyActiveId=id;mountHistoryMap();}});
  };
  const updateModalResults = (result, query) => { const target=$('#travelPlaceResults',view); if(!target)return; if(result.status==='unavailable') { target.innerHTML=`<p class="travel-search-message">${esc(result.message || '검색 설정을 확인해 주세요.')}</p>`; return; } if(result.status==='limit'||result.status==='error'){ target.innerHTML=`<p class="travel-search-message">${esc(result.message || '검색에 실패했어요. 다시 시도해 주세요.')}</p>`; return; } if(!result.items?.length){ target.innerHTML=`<p class="travel-search-message">'${esc(query)}' 검색 결과가 없어요. 아래에 이름과 주소를 적어 기록할 수 있어요.</p>`; return; } target.innerHTML=result.items.map(place=>`<button type="button" class="travel-place-result" data-place-result="${esc(JSON.stringify(place))}"><strong>${esc(place.name)}</strong><small>${esc(place.address || '주소 미정')}</small></button>`).join(''); };
  const search = async () => { const input=$('#travelPlaceForm input[name="query"]',view); const query=input?.value.trim(); if(!query)return; const request=++current.searchRequest; const target=$('#travelPlaceResults',view); if(target)target.innerHTML='<p class="travel-search-message">장소를 찾고 있어요…</p>'; try{ const result=await data.searchPlaces(query,{limit:10}); if(request===current.searchRequest)updateModalResults(result,query); }catch(error){ if(request===current.searchRequest)updateModalResults({status:'error',message:error.message},query); } };
  const submit = async event => { const form=event.target; if(!(form instanceof HTMLFormElement))return; event.preventDefault(); const values=Object.fromEntries(new FormData(form).entries()); if(form.id==='travelBulkForm')return applyBulk(event.submitter?.dataset.travelBulkAction); if(current.bulkBusy)return; if(form.id==='travelTripForm'){values.destinationCustom=resolveDestination(values);values.destination='';} const active=trip(); try{
    if(form.id==='travelTripForm'){ const destination=String(values.destinationCustom||values.destination||'').trim(); if(!destination)throw new Error('여행지를 선택하거나 직접 입력해 주세요.'); if(current.editingId&&active){ try{ await data.updateTrip(active.id,{title:values.title,destinationLabel:destination,destination,startDate:values.startDate,endDate:values.endDate,intro:values.intro}); }catch(error){ if(error.code==='OUT_OF_RANGE'&&window.confirm('기간 밖에 있는 기록을 보관함으로 옮기고 날짜를 줄일까요?')) await data.moveOutOfRangeToInbox(active.id,{title:values.title,destinationLabel:destination,destination,startDate:values.startDate,endDate:values.endDate,intro:values.intro}); else throw error; } } else { const created=await data.createTrip({title:values.title,destinationLabel:destination,destination,startDate:values.startDate,endDate:values.endDate,intro:values.intro}); clearSelection(); clearItineraryFilters(); current.page='manage'; current.tripId=created.id; current.tab='day-0'; } current.editingId=null; closeModal(); render(); return; }
    if(!active)return;
    if(form.id==='travelPlaceForm'){ const dayIndex=values.dayIndex===''?null:Number(values.dayIndex); const selected=current.selectedPlace; const place=selected?{...selected}:{provider:'manual',providerId:null,name:values.title,address:values.address,lat:null,lng:null,attribution:null}; await data.addPlace(active.id,{title:values.title||selected?.name,place,dayIndex,time:values.time||null,note:values.note}); closeModal(); render(); return; }
    if(form.id==='travelNoteForm'){ await data.addNote(active.id,{title:values.title,dayIndex:values.dayIndex===''?null:Number(values.dayIndex),time:values.time||null,note:values.note}); closeModal(); render(); return; }
    if(form.id==='travelItemForm'){ await data.updateItem(active.id,form.dataset.itemId,{title:values.title,dayIndex:values.dayIndex===''?null:Number(values.dayIndex),time:values.time||null,note:values.note}); closeModal(); render(); }
  }catch(error){ window.alert(error.message||'저장하지 못했어요.'); } };
  const click = async event => {
    const target=event.target.closest('button,a,[data-map-item]');
    if(!target)return;
    const active=trip();
    if(current.bulkBusy&&!target.matches('[data-travel-page],[data-travel-back]'))return;
    if(target.matches('[data-travel-bulk-start]')){clearSelection();current.selecting=true;return render();}
    if(target.matches('[data-travel-bulk-end]')){clearSelection();return render();}
    if(target.matches('[data-travel-bulk-clear]')){current.selectedIds.clear();current.bulkMessage='';return updateBulkView();}
    if(target.matches('[data-travel-bulk-visible]')){activeItems(active).filter(entry=>entry.type==='place').forEach(entry=>current.selectedIds.add(entry.id));current.bulkMessage='';return updateBulkView();}
    if(target.matches('[data-travel-itinerary-clear]')){clearItineraryFilters();render();$('[data-travel-itinerary-query]',view)?.focus();return;}
    if(target.matches('[data-travel-close]'))return closeModal();
    if(target.matches('[data-travel-new]')){clearItineraryFilters();render();current.editingId=null;current.modalMode='trip';return showModal('새 여행',tripForm());}
    if(target.matches('[data-travel-page]')){clearSelection();clearItineraryFilters();current.page=target.dataset.travelPage;current.tripId=null;current.activeItemId=null;return render();}
    if(target.matches('[data-travel-back]')){clearSelection();clearItineraryFilters();current.tripId=null;current.activeItemId=null;return render();}
    if(target.matches('[data-travel-filter]')){current.filter=target.dataset.travelFilter;view.querySelectorAll('[data-travel-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button===target)));$('[data-travel-results]',view).innerHTML=management.renderResults(data.getTrips({includeArchived:true}),current);return;}
    if(target.matches('[data-travel-open]')){clearSelection();clearItineraryFilters();current.tripId=target.dataset.travelOpen;current.tab='all';current.activeItemId=null;render();$('.travel-back',view)?.focus();return;}
    if(target.matches('[data-travel-restore]')){target.disabled=true;try{await data.restoreTrip(target.dataset.travelRestore);current.filter='all';render();}finally{target.disabled=false;}return;}
    if(target.matches('[data-travel-search]'))return search();
    if(target.matches('[data-place-result]')){try{current.selectedPlace=JSON.parse(target.dataset.placeResult);target.parentElement.querySelectorAll('.travel-place-result').forEach(node=>node.classList.toggle('selected',node===target));const title=$('#travelPlaceForm input[name="title"]',view),address=$('#travelPlaceForm input[name="address"]',view);if(title&&!title.value)title.value=current.selectedPlace.name;if(address&&!address.value)address.value=current.selectedPlace.address;}catch{/* malformed result is ignored */}return;}
    if(target.matches('[data-travel-external]'))return;
    if(target.matches('[data-travel-map-retry]'))return target.closest('.travel-history-map')?mountHistoryMap(true):mountMap(true);
    if(!active)return;
    if(target.matches('[data-travel-edit]')){current.editingId=active.id;return showModal('여행 정보',tripForm(active));}
    if(target.matches('[data-travel-tab]')){current.tab=target.dataset.travelTab;current.activeItemId=null;return render();}
    if(target.matches('[data-travel-add-place]')){const day=target.hasAttribute('data-travel-inbox')?null:target.hasAttribute('data-travel-day-index')?Number(target.dataset.travelDayIndex):defaultDayIndex();current.modalMode='place';return showModal('장소 추가',placeForm(active,day));}
    if(target.matches('[data-travel-add-note]')){const day=target.hasAttribute('data-travel-inbox')?null:target.hasAttribute('data-travel-day-index')?Number(target.dataset.travelDayIndex):defaultDayIndex();current.modalMode='note';return showModal('메모 추가',noteForm(active,day));}
    if(target.matches('[data-travel-archive]')){if(window.confirm('이 여행을 보관함으로 옮길까요?')){await data.archiveTrip(active.id);clearSelection();clearItineraryFilters();current.tripId=null;current.tab='all';render();}return;}
    if(target.matches('[data-travel-select-item]'))return selectMapItem(target.dataset.travelSelectItem,true);
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
    if (target.matches('[data-travel-layout]')) { event.preventDefault(); event.stopImmediatePropagation(); current.layout=target.dataset.travelLayout; render(); return; }
    const add = target.closest('[data-travel-add-place],[data-travel-add-note]');
    if (add) {
      event.preventDefault(); event.stopImmediatePropagation();
      const selectedDay = add.hasAttribute('data-travel-inbox') ? null : add.hasAttribute('data-travel-day-index') ? Number(add.dataset.travelDayIndex) : defaultDayIndex();
      if (add.matches('[data-travel-add-place]')) { current.modalMode='place'; showModal('장소 추가',placeForm(trip(),selectedDay)); }
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
      view.addEventListener('click',event=>{if(event.target.matches('.travel-modal-backdrop'))closeModal();});
      view.addEventListener('submit',submit);
      view.addEventListener('change',event=>{
        const target=event.target;
        if(current.bulkBusy)return;
        if(target.matches('[data-travel-itinerary-status]')){current.itineraryStatus=target.value;current.activeItemId=null;render();return;}
        if(target.matches('[data-travel-select-place]')){const id=target.dataset.travelSelectPlace;if(!trip()?.items.some(entry=>entry.id===id&&entry.type==='place'))return;target.checked?current.selectedIds.add(id):current.selectedIds.delete(id);current.bulkMessage='';updateBulkView();}
        if(target.matches('[data-travel-bulk-day]')){current.bulkDay=target.value;const move=$('[data-travel-bulk-action="move"]',view);if(move)move.disabled=!current.selectedIds.size||target.value==='choose';}
      });
      view.addEventListener('input',event=>{if(event.target.matches('[data-travel-itinerary-query]')){if(current.bulkBusy||event.isComposing)return;current.itineraryQuery=event.target.value;current.activeItemId=null;render();return;}if(!event.target.matches('[data-travel-query]'))return;current.query=event.target.value;const results=$('[data-travel-results]',view);if(results)results.innerHTML=management.renderResults(data.getTrips({includeArchived:true}),current);});
    }
    render();
    if(!data.isLocal()&&!refreshPromise){refreshPromise=data.refresh().then(()=>{render();}).catch(error=>{if(view&&window.FAMILY_APP_STATE?.activeView==='travel')window.alert(error.message||'가족 여행을 불러오지 못했어요.');}).finally(()=>{refreshPromise=null;});}
  };
  const baseSwitch=window.switchView;
  window.switchView=function travelSwitch(next){if(next!=='travel'){clearSelection();if($('#travelModal',view)?.open)closeModal();view?.setAttribute('hidden','');return baseSwitch(next);}ensure();if(window.FAMILY_APP_STATE)window.FAMILY_APP_STATE.activeView='travel';document.querySelectorAll('.view-tab[data-view]').forEach(tab=>{const selected=tab.dataset.view==='travel';tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;});document.querySelector('main')?.querySelectorAll(':scope > [id$="View"]').forEach(other=>{if(other!==view)other.hidden=true;});$('#addEventButton')?.setAttribute('hidden','');view.hidden=false;mountMap();mountHistoryMap();};
  window.switchView.__familyTravelInstalled=true; window.FAMILY_TRAVEL_READY=true;
  window.addEventListener('family:travel-change',()=>{if(view&&window.FAMILY_APP_STATE?.activeView==='travel')render();}); window.addEventListener('familycontextchange',()=>{map.destroy();historyMap.destroy();historyActiveId=null;historyItems=[];clearSelection();clearItineraryFilters();current.page='manage';current.query='';current.filter='all';current.tripId=null;current.activeItemId=null;current.tab='all';render();refreshPromise=null;if(view&&window.FAMILY_APP_STATE?.activeView==='travel')ensure();}); ensure();
  window.addEventListener('family:travel-remote-change',()=>{ if(!view||window.FAMILY_APP_STATE?.activeView!=='travel'||!$('#travelModal',view)?.hidden)return; data.refresh().then(()=>render()).catch(()=>{}); });
})();
