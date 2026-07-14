const MEMBERS = ["가족", "아빠", "엄마", "도윤"];
const STORAGE_KEY = "family-calendar-events-v1";
const GROWTH_STORAGE_KEY = "family-growth-entries-v1";
const GROWTH_PHOTO_BUCKET = "growth-photos";
const MAX_GROWTH_PHOTOS = 4;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_GROWTH_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const state = { viewDate: startOfMonth(new Date()), selectedDate: dateKey(new Date()), activeView: "calendar", quickMember: "가족", events: [], growthEntries: [], supabase: null, session: null, household: null, authReady: false, onboardingPrompted: false };
const $ = (selector) => document.querySelector(selector);
const config = window.FAMILY_CONFIG || {};
let dragState = null;
let growthPhotoDraft = { existingPaths: [], existingUrls: [], removedPaths: [], newPhotos: [] };

function dateKey(date) {
  const y = date.getFullYear();
  return `${y}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
function normalizeEvent(event) { return { ...event, endDate: event.endDate || event.date }; }
function eventOccursOn(event, key) { return event.date <= key && (event.endDate || event.date) >= key; }
function dayDistance(startKey, endKey) {
  const start = parseDate(startKey); const end = parseDate(endKey);
  return Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
}
function addDays(key, days) { const date = parseDate(key); date.setDate(date.getDate() + days); return dateKey(date); }
function formatEventRange(event) {
  if (!event.endDate || event.endDate === event.date) return "";
  const start = parseDate(event.date); const end = parseDate(event.endDate);
  const startText = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(start);
  const endText = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(end);
  return `${startText}–${endText}`;
}
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function escapeHtml(value = "") { return value.replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]); }
function toast(message, action = null) {
  const el = $("#toast");
  $("#toastMessage").textContent = message;
  const button = $("#toastAction");
  button.hidden = !action;
  button.textContent = action?.label || "";
  button.onclick = action ? () => { el.classList.remove("show"); action.run(); } : null;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), action ? 4500 : 2200);
}

async function init() {
  bindUi();
  if (config.supabaseUrl && config.supabaseAnonKey && window.supabase) {
    state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data } = await state.supabase.auth.getSession();
    state.session = data.session;
    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      if (!session) state.onboardingPrompted = false;
      bootstrapData();
    });
  }
  state.authReady = true;
  await bootstrapData();
}

async function bootstrapData() {
  if (state.supabase && state.session) {
    const { data: memberships } = await state.supabase.from("household_members").select("household_id, households(id,name,invite_code)").limit(1);
    state.household = memberships?.[0]?.households || null;
    if (state.household) await loadRemoteData(); else { state.events = []; state.growthEntries = []; }
  } else {
    state.household = null;
    state.events = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map(normalizeEvent);
    state.growthEntries = JSON.parse(localStorage.getItem(GROWTH_STORAGE_KEY) || "[]");
  }
  render();
  updateAuthGate();
  if (state.session && !state.household && !state.onboardingPrompted) {
    state.onboardingPrompted = true;
    setTimeout(openAccountDialog, 250);
  }
}

async function loadRemoteData() {
  const [eventsResult, growthResult] = await Promise.all([
    state.supabase.from("events").select("*").eq("household_id", state.household.id).order("event_date"),
    state.supabase.from("growth_entries").select("*").eq("household_id", state.household.id).order("entry_date", { ascending: false }),
  ]);
  if (eventsResult.error) toast("일정을 불러오지 못했어요"); else state.events = eventsResult.data.map(fromRemote);
  if (growthResult.error) toast("성장일기를 불러오지 못했어요");
  else {
    state.growthEntries = growthResult.data.map(fromGrowthRemote);
    await hydrateGrowthPhotoUrls(state.growthEntries);
  }
}

function fromRemote(row) { return normalizeEvent({ id: row.id, title: row.title, date: row.event_date, endDate: row.event_end_date, time: row.event_time?.slice(0, 5) || "", member: row.member, note: row.note || "" }); }
function toRemote(event) { return { id: event.id, household_id: state.household.id, title: event.title, event_date: event.date, event_end_date: event.endDate || event.date, event_time: event.time || null, member: event.member, note: event.note || null, created_by: state.session.user.id }; }
function fromGrowthRemote(row) {
  return {
    id: row.id, title: row.title, date: row.entry_date, time: row.entry_time?.slice(0, 5) || "", category: row.category,
    height: row.height_cm, weight: row.weight_kg, head: row.head_cm, feedingMl: row.feeding_ml,
    sleepMinutes: row.sleep_minutes, temperature: row.temperature_c, diaperKind: row.diaper_kind || "",
    note: row.note || "", photoPaths: row.photo_paths || [], photoUrls: [],
  };
}
function toGrowthRemote(entry) {
  return {
    id: entry.id, household_id: state.household.id, title: entry.title, entry_date: entry.date,
    entry_time: entry.time || null, category: entry.category, height_cm: entry.height || null,
    weight_kg: entry.weight || null, head_cm: entry.head || null, feeding_ml: entry.feedingMl || null,
    sleep_minutes: entry.sleepMinutes || null, temperature_c: entry.temperature || null,
    diaper_kind: entry.diaperKind || null, note: entry.note || null, photo_paths: entry.photoPaths || [],
    created_by: state.session.user.id,
  };
}

async function hydrateGrowthPhotoUrls(entries) {
  const paths = [...new Set(entries.flatMap((entry) => entry.photoPaths || []))];
  if (!state.supabase || !paths.length) return;
  const { data, error } = await state.supabase.storage.from(GROWTH_PHOTO_BUCKET).createSignedUrls(paths, 3600);
  if (error) return;
  const urls = new Map((data || []).map((item) => [item.path, item.signedUrl]));
  entries.forEach((entry) => { entry.photoUrls = (entry.photoPaths || []).map((path) => urls.get(path) || ""); });
}

function bindUi() {
  $("#prevMonth").addEventListener("click", () => changeMonth(-1));
  $("#nextMonth").addEventListener("click", () => changeMonth(1));
  $("#todayButton").addEventListener("click", () => { state.viewDate = startOfMonth(new Date()); state.selectedDate = dateKey(new Date()); render(); });
  $("#addEventButton").addEventListener("click", () => state.activeView === "calendar" ? openEventDialog() : openGrowthDialog());
  document.querySelectorAll(".view-tab").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $("#accountButton").addEventListener("click", openAccountDialog);
  $("#googleSignIn").addEventListener("click", signInWithGoogle);
  $("#gateLoginForm").addEventListener("submit", sendMagicLink);
  $("#quickEventForm").addEventListener("submit", quickAddEvent);
  $("#quickTimeButton").addEventListener("click", toggleQuickTime);
  document.querySelectorAll("#quickMemberChips [data-member]").forEach((button) => button.addEventListener("click", () => selectQuickMember(button.dataset.member)));
  $("#eventForm").addEventListener("submit", saveEvent);
  $("#deleteEventButton").addEventListener("click", deleteEvent);
  $("#eventAllDay").addEventListener("change", syncAllDayControl);
  $("#eventHasRange").addEventListener("change", syncRangeControl);
  $("#eventDate").addEventListener("change", syncRangeDates);
  $("#eventEndDate").addEventListener("change", syncRangeDates);
  document.querySelectorAll("#eventMemberSelector [data-member]").forEach((button) => button.addEventListener("click", () => selectEventMember(button.dataset.member)));
  document.querySelectorAll("[data-date-shortcut]").forEach((button) => button.addEventListener("click", () => applyDateShortcut(button.dataset.dateShortcut)));
  $("#growthForm").addEventListener("submit", saveGrowthEntry);
  $("#deleteGrowthButton").addEventListener("click", deleteGrowthEntry);
  $("#growthCategory").addEventListener("change", syncGrowthFields);
  $("#growthPhotos").addEventListener("change", addGrowthPhotos);
  $("#growthPhotoPreview").addEventListener("click", removeGrowthPhoto);
  document.querySelectorAll("[data-growth-quick]").forEach((button) => button.addEventListener("click", () => openGrowthDialog(null, button.dataset.growthQuick)));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
}

function changeMonth(delta) { state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() + delta, 1); renderCalendar(); }
function render() { renderHeader(); renderCalendar(); renderAgenda(); renderGrowth(); updateSyncBadge(); }
function renderHeader() {
  const today = new Date();
  $("#todayLabel").textContent = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(today);
  const todayEvents = state.events.filter((event) => eventOccursOn(event, dateKey(today)));
  $("#todaySummary").textContent = todayEvents.length ? `오늘은 ${todayEvents.length}개의 약속이 있어요` : "오늘도 우리답게";
}
function updateSyncBadge() { $("#syncDot").classList.toggle("online", Boolean(state.session && state.household)); }
function updateAuthGate() {
  const loginRequired = Boolean(state.authReady && state.supabase && !state.session);
  $("#authGate").hidden = !loginRequired;
  $("#appShell").toggleAttribute("inert", loginRequired);
  document.body.classList.toggle("auth-required", loginRequired);
}
function switchView(view) {
  state.activeView = view;
  $("#calendarView").hidden = view !== "calendar";
  $("#growthView").hidden = view !== "growth";
  document.querySelectorAll(".view-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#addEventButton").innerHTML = view === "calendar" ? "<span>＋</span> 일정 추가" : "<span>＋</span> 성장 기록";
}

function renderCalendar() {
  const year = state.viewDate.getFullYear(); const month = state.viewDate.getMonth();
  $("#monthLabel").textContent = `${year}년 ${month + 1}월`;
  const first = new Date(year, month, 1); const start = new Date(year, month, 1 - first.getDay());
  const grid = $("#calendarGrid"); grid.innerHTML = "";
  for (let i = 0; i < 42; i++) {
    const day = new Date(start); day.setDate(start.getDate() + i); const key = dateKey(day);
    const dayEvents = state.events.filter((event) => eventOccursOn(event, key));
    const button = document.createElement("button"); button.className = "calendar-day";
    if (day.getMonth() !== month) button.classList.add("outside");
    if (key === state.selectedDate) button.classList.add("selected");
    if (key === dateKey(new Date())) button.classList.add("today");
    button.dataset.date = key;
    button.setAttribute("aria-label", `${day.getMonth() + 1}월 ${day.getDate()}일, 일정 ${dayEvents.length}개`);
    const firstEvent = dayEvents.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"))[0];
    button.innerHTML = `<span class="day-number">${day.getDate()}</span>${firstEvent ? `<span class="day-event-preview ${firstEvent.member} ${firstEvent.endDate !== firstEvent.date ? "spans-range" : ""}" data-event-id="${firstEvent.id}">${escapeHtml(firstEvent.title)}</span>` : `<span class="event-dots"></span>`}${dayEvents.length > 1 ? `<span class="more-events">+${dayEvents.length - 1}</span>` : ""}`;
    button.addEventListener("click", () => { state.selectedDate = key; if (day.getMonth() !== month) state.viewDate = startOfMonth(day); renderCalendar(); renderAgenda(); });
    grid.appendChild(button);
  }
  grid.querySelectorAll(".day-event-preview").forEach((preview) => {
    preview.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = state.events.find((entry) => entry.id === preview.dataset.eventId);
      if (item) openEventDialog(item);
    });
  });
}

function renderAgenda() {
  const date = parseDate(state.selectedDate); const events = state.events.filter((event) => eventOccursOn(event, state.selectedDate)).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  $("#agendaTitle").textContent = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(date);
  $("#agendaCount").textContent = `${events.length}개 일정`;
  $("#quickDateBadge").innerHTML = `<strong>${date.getDate()}</strong><span>${date.getMonth() + 1}월</span>`;
  const list = $("#agendaList");
  if (!events.length) { list.innerHTML = `<div class="empty-state"><strong>아직 일정이 없어요</strong><span>위 입력창에 이름만 적으면 바로 추가할 수 있어요.</span></div>`; return; }
  list.innerHTML = events.map((event) => `<article class="agenda-item" data-id="${event.id}"><i class="bar ${event.member}"></i><button class="agenda-main" type="button"><span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.member)}${event.note ? ` · ${escapeHtml(event.note)}` : ""}</small></span><span class="event-when">${formatEventRange(event) ? `<b>${escapeHtml(formatEventRange(event))}</b>` : ""}<small>${event.time || "종일"}</small></span></button><button class="edit-event-button" type="button" aria-label="${escapeHtml(event.title)} 수정">편집</button><button class="drag-handle" type="button" aria-label="${escapeHtml(event.title)} 날짜 이동" title="날짜로 끌어 이동"><span aria-hidden="true">⠿</span></button></article>`).join("");
  list.querySelectorAll(".agenda-item").forEach((item) => {
    const event = state.events.find((entry) => entry.id === item.dataset.id);
    item.querySelector(".agenda-main").addEventListener("click", () => openEventDialog(event));
    item.querySelector(".edit-event-button").addEventListener("click", () => openEventDialog(event));
    bindDragHandle(item.querySelector(".drag-handle"), event);
  });
}

function selectQuickMember(member) {
  state.quickMember = member;
  document.querySelectorAll("#quickMemberChips [data-member]").forEach((button) => button.classList.toggle("selected", button.dataset.member === member));
}

function toggleQuickTime() {
  const input = $("#quickEventTime");
  const show = input.hidden;
  input.hidden = !show;
  $("#quickTimeButton").classList.toggle("active", show);
  $("#quickTimeButton").setAttribute("aria-expanded", String(show));
  $("#quickTimeButton").textContent = show ? "시간 제거" : "＋ 시간";
  if (show) input.focus(); else input.value = "";
}

async function quickAddEvent(event) {
  event.preventDefault();
  if (state.supabase && !state.household) return toast("먼저 가족 공간을 만들어주세요");
  const title = $("#quickEventTitle").value.trim();
  if (!title) return;
  const item = { id: uid(), title, date: state.selectedDate, endDate: state.selectedDate, time: $("#quickEventTime").value, member: state.quickMember, note: "" };
  if (!await storeEvent(item)) return;
  state.events.push(item);
  persistLocal();
  $("#quickEventTitle").value = "";
  render();
  $("#quickEventTitle").focus();
  toast("일정을 바로 추가했어요", { label: "수정", run: () => openEventDialog(item) });
}

function bindDragHandle(handle, event) {
  handle.addEventListener("pointerdown", (pointerEvent) => {
    if (pointerEvent.button !== undefined && pointerEvent.button !== 0) return;
    pointerEvent.preventDefault();
    beginEventDrag(pointerEvent, event, handle);
  });
}

function beginEventDrag(pointerEvent, event, source) {
  if (dragState) finishEventDrag(null);
  const ghost = $("#dragGhost");
  dragState = { pointerId: pointerEvent.pointerId, event, source, targetDate: null };
  source.setPointerCapture?.(pointerEvent.pointerId);
  ghost.innerHTML = `<i class="bar ${event.member}"></i><span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.member)} · 날짜 이동</small></span>`;
  ghost.classList.add("show");
  document.body.classList.add("dragging-event");
  moveDragGhost(pointerEvent.clientX, pointerEvent.clientY);
  source.addEventListener("pointermove", updateEventDrag);
  source.addEventListener("pointerup", finishEventDrag);
  source.addEventListener("pointercancel", finishEventDrag);
  if (navigator.vibrate) navigator.vibrate(10);
}

function moveDragGhost(x, y) {
  const ghost = $("#dragGhost");
  ghost.style.transform = `translate3d(${Math.min(x + 14, window.innerWidth - 230)}px, ${Math.max(12, y - 34)}px, 0)`;
}

function updateEventDrag(pointerEvent) {
  if (!dragState || pointerEvent.pointerId !== dragState.pointerId) return;
  pointerEvent.preventDefault();
  moveDragGhost(pointerEvent.clientX, pointerEvent.clientY);
  if (pointerEvent.clientY < 72) window.scrollBy(0, -12);
  if (pointerEvent.clientY > window.innerHeight - 72) window.scrollBy(0, 12);
  document.querySelectorAll(".calendar-day.drop-target").forEach((day) => day.classList.remove("drop-target"));
  const target = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)?.closest(".calendar-day");
  dragState.targetDate = target?.dataset.date || null;
  if (target) target.classList.add("drop-target");
}

function finishEventDrag(pointerEvent) {
  if (!dragState || (pointerEvent && pointerEvent.pointerId !== dragState.pointerId)) return;
  const { source, event } = dragState;
  const targetDate = pointerEvent?.type === "pointercancel" ? null : dragState.targetDate;
  source.removeEventListener("pointermove", updateEventDrag);
  source.removeEventListener("pointerup", finishEventDrag);
  source.removeEventListener("pointercancel", finishEventDrag);
  document.querySelectorAll(".calendar-day.drop-target").forEach((day) => day.classList.remove("drop-target"));
  $("#dragGhost").classList.remove("show");
  document.body.classList.remove("dragging-event");
  dragState = null;
  if (!targetDate) return toast("이동할 날짜 위에 놓아주세요");
  moveEventToDate(event.id, targetDate);
}

async function moveEventToDate(id, targetDate, offerUndo = true) {
  const event = state.events.find((item) => item.id === id);
  if (!event || event.date === targetDate) return toast("같은 날짜의 일정이에요");
  const previousDate = event.date;
  const previousEndDate = event.endDate || event.date;
  const duration = dayDistance(previousDate, previousEndDate);
  event.date = targetDate;
  event.endDate = addDays(targetDate, duration);
  state.selectedDate = targetDate;
  state.viewDate = startOfMonth(parseDate(targetDate));
  render();
  if (state.supabase && state.session) {
    const { error } = await state.supabase.from("events").update({ event_date: targetDate, event_end_date: event.endDate, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      event.date = previousDate;
      event.endDate = previousEndDate;
      state.selectedDate = previousDate;
      state.viewDate = startOfMonth(parseDate(previousDate));
      render();
      return toast("일정을 이동하지 못했어요");
    }
  } else {
    persistLocal();
  }
  const formatted = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(parseDate(targetDate));
  toast(`${formatted}로${duration ? ` ${duration + 1}일 기간을` : ""} 이동했어요`, offerUndo ? { label: "되돌리기", run: () => moveEventToDate(id, previousDate, false) } : null);
}

async function storeEvent(item) {
  if (state.supabase && state.session) {
    const { error } = await state.supabase.from("events").upsert(toRemote(item));
    if (error) {
      toast(error.message?.includes("event_end_date") ? "Supabase 날짜 범위 업데이트가 필요해요" : "저장하지 못했어요");
      return false;
    }
  }
  return true;
}

function openEventDialog(event = null) {
  $("#eventDialogTitle").textContent = event ? "일정 수정" : "새 일정";
  $("#eventSubmitButton").textContent = event ? "변경사항 저장" : "일정 추가";
  $("#eventId").value = event?.id || "";
  $("#eventTitle").value = event?.title || "";
  $("#eventDate").value = event?.date || state.selectedDate;
  $("#eventEndDate").value = event?.endDate || event?.date || state.selectedDate;
  $("#eventHasRange").checked = Boolean(event && event.endDate && event.endDate !== event.date);
  $("#eventTime").value = event?.time || "";
  $("#eventAllDay").checked = !event?.time;
  selectEventMember(event?.member || MEMBERS[0]);
  $("#eventNote").value = event?.note || "";
  syncAllDayControl();
  syncRangeControl();
  syncDateShortcutSelection();
  $("#deleteEventButton").classList.toggle("visible", Boolean(event)); $("#eventDialog").showModal(); setTimeout(() => $("#eventTitle").focus(), 100);
}

function selectEventMember(member) {
  $("#eventMember").value = member;
  document.querySelectorAll("#eventMemberSelector [data-member]").forEach((button) => button.classList.toggle("selected", button.dataset.member === member));
}

function syncAllDayControl() {
  const allDay = $("#eventAllDay").checked;
  $("#eventTimeField").hidden = allDay;
  if (allDay) $("#eventTime").value = "";
}

function syncRangeControl() {
  const hasRange = $("#eventHasRange").checked;
  $("#eventEndDateField").hidden = !hasRange;
  $("#eventEndDateField").parentElement.classList.toggle("has-range", hasRange);
  if (!hasRange || !$("#eventEndDate").value) $("#eventEndDate").value = $("#eventDate").value;
  syncRangeDates();
}

function syncRangeDates() {
  const start = $("#eventDate").value;
  const end = $("#eventEndDate").value;
  $("#eventEndDate").min = start;
  if (start && (!end || end < start)) $("#eventEndDate").value = start;
  syncDateShortcutSelection();
}

function applyDateShortcut(shortcut) {
  const date = shortcut === "selected" ? parseDate(state.selectedDate) : new Date();
  if (shortcut === "tomorrow") date.setDate(date.getDate() + 1);
  const currentStart = $("#eventDate").value;
  const currentEnd = $("#eventEndDate").value || currentStart;
  const duration = $("#eventHasRange").checked && currentStart ? Math.max(0, dayDistance(currentStart, currentEnd)) : 0;
  $("#eventDate").value = dateKey(date);
  $("#eventEndDate").value = addDays(dateKey(date), duration);
  syncRangeDates();
}

function syncDateShortcutSelection() {
  const value = $("#eventDate").value;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const values = { selected: state.selectedDate, today: dateKey(new Date()), tomorrow: dateKey(tomorrow) };
  const active = value === values.today ? "today" : value === values.tomorrow ? "tomorrow" : value === values.selected ? "selected" : "";
  document.querySelectorAll("[data-date-shortcut]").forEach((button) => button.classList.toggle("active", button.dataset.dateShortcut === active));
}

async function saveEvent(event) {
  event.preventDefault();
  if (state.supabase && !state.household) { $("#eventDialog").close(); return toast("먼저 가족 공간을 만들어주세요"); }
  const startDate = $("#eventDate").value;
  const endDate = $("#eventHasRange").checked ? $("#eventEndDate").value : startDate;
  if (endDate < startDate) return toast("종료일은 시작일 이후로 선택해 주세요");
  const item = { id: $("#eventId").value || uid(), title: $("#eventTitle").value.trim(), date: startDate, endDate, time: $("#eventTime").value, member: $("#eventMember").value, note: $("#eventNote").value.trim() };
  if (!await storeEvent(item)) return;
  const index = state.events.findIndex((e) => e.id === item.id); if (index >= 0) state.events[index] = item; else state.events.push(item);
  persistLocal(); state.selectedDate = item.date; state.viewDate = startOfMonth(parseDate(item.date)); $("#eventDialog").close(); render(); toast(index >= 0 ? "일정을 수정했어요" : "일정을 추가했어요");
}

async function deleteEvent() {
  const id = $("#eventId").value; if (!id || !confirm("이 일정을 삭제할까요?")) return;
  if (state.supabase && state.session) { const { error } = await state.supabase.from("events").delete().eq("id", id); if (error) return toast("삭제하지 못했어요"); }
  state.events = state.events.filter((event) => event.id !== id); persistLocal(); $("#eventDialog").close(); render(); toast("일정을 삭제했어요");
}
function persistLocal() { if (!state.supabase) localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events)); }

function renderGrowth() {
  const entries = [...state.growthEntries].sort((a, b) => `${b.date}T${b.time || "23:59"}`.localeCompare(`${a.date}T${a.time || "23:59"}`));
  $("#growthCount").textContent = `${entries.length}개 기록`;
  const latestSize = entries.find((entry) => entry.height || entry.weight);
  $("#growthSummary").textContent = latestSize ? [latestSize.height && `키 ${latestSize.height}cm`, latestSize.weight && `몸무게 ${latestSize.weight}kg`].filter(Boolean).join(" · ") : entries.length ? `${entries.length}개의 순간을 간직했어요` : "첫 기록을 남겨보세요";
  const list = $("#growthList");
  if (!entries.length) { list.innerHTML = `<div class="empty-state">아직 성장 기록이 없어요.<br />오늘의 도윤이를 남겨보세요.</div>`; return; }
  list.innerHTML = entries.map((entry) => {
    const preview = entry.photoUrls?.find(Boolean);
    const meta = growthEntryMeta(entry);
    return `<button class="growth-entry ${preview ? "has-photo" : ""}" data-id="${entry.id}">${preview ? `<img class="growth-thumbnail" src="${escapeHtml(preview)}" alt="" loading="lazy" />` : `<span class="growth-date"><strong>${parseDate(entry.date).getDate()}</strong>${parseDate(entry.date).getMonth() + 1}월</span>`}<span class="growth-body"><i>${escapeHtml(entry.category)}${entry.time ? ` · ${escapeHtml(entry.time)}` : ""}</i><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.note || meta || "기록 보기")}</small></span>${entry.photoPaths?.length ? `<span class="photo-count">📷 ${entry.photoPaths.length}</span>` : `<span class="growth-arrow">›</span>`}</button>`;
  }).join("");
  list.querySelectorAll(".growth-entry").forEach((item) => item.addEventListener("click", () => openGrowthDialog(state.growthEntries.find((entry) => entry.id === item.dataset.id))));
}

function growthEntryMeta(entry) {
  const parts = [];
  if (entry.height) parts.push(`키 ${entry.height}cm`);
  if (entry.weight) parts.push(`몸무게 ${entry.weight}kg`);
  if (entry.head) parts.push(`머리둘레 ${entry.head}cm`);
  if (entry.feedingMl) parts.push(`${entry.feedingMl}ml`);
  if (entry.sleepMinutes) parts.push(formatDuration(entry.sleepMinutes));
  if (entry.temperature) parts.push(`${entry.temperature}°C`);
  if (entry.diaperKind) parts.push(entry.diaperKind);
  return parts.join(" · ");
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return [hours && `${hours}시간`, rest && `${rest}분`].filter(Boolean).join(" ") || "0분";
}

function defaultGrowthTitle(category) {
  return ({ "수유·이유식": "수유 기록", "수면": "수면 기록", "기저귀": "기저귀 기록", "건강·병원": "건강 기록", "성장": "성장 측정", "첫 순간": "새로운 첫 순간", "놀이": "오늘의 놀이", "기타": "도윤이 기록" })[category] || "도윤이 기록";
}

function openGrowthDialog(entry = null, category = "첫 순간") {
  $("#growthDialogTitle").textContent = entry ? "성장 기록 수정" : "새 성장 기록";
  resetGrowthPhotoDraft();
  growthPhotoDraft.existingPaths = [...(entry?.photoPaths || [])];
  growthPhotoDraft.existingUrls = [...(entry?.photoUrls || [])];
  $("#growthId").value = entry?.id || "";
  $("#growthEntryTitle").value = entry?.title || "";
  $("#growthDate").value = entry?.date || dateKey(new Date());
  $("#growthTime").value = entry?.time || new Date().toTimeString().slice(0, 5);
  $("#growthCategory").value = entry?.category || category;
  $("#growthHeight").value = entry?.height || ""; $("#growthWeight").value = entry?.weight || ""; $("#growthHead").value = entry?.head || "";
  $("#growthFeedingMl").value = entry?.feedingMl || ""; $("#growthSleepMinutes").value = entry?.sleepMinutes || "";
  $("#growthTemperature").value = entry?.temperature || ""; $("#growthDiaperKind").value = entry?.diaperKind || "";
  $("#growthNote").value = entry?.note || "";
  syncGrowthFields(); renderGrowthPhotoPreview();
  $("#deleteGrowthButton").classList.toggle("visible", Boolean(entry)); $("#growthDialog").showModal(); setTimeout(() => $("#growthEntryTitle").focus(), 100);
}

function syncGrowthFields() {
  const category = $("#growthCategory").value;
  document.querySelectorAll("[data-growth-fields]").forEach((group) => { group.hidden = group.dataset.growthFields !== category; });
  const placeholders = { "수유·이유식": "예: 분유를 맛있게 먹었어요", "수면": "예: 낮잠을 푹 잤어요", "기저귀": "예: 기저귀 갈았어요", "건강·병원": "예: 예방접종 다녀왔어요", "성장": "예: 한 달 성장 측정", "첫 순간": "예: 처음으로 뒤집었어요" };
  $("#growthEntryTitle").placeholder = placeholders[category] || "오늘의 도윤이를 적어주세요";
}

function resetGrowthPhotoDraft() {
  growthPhotoDraft.newPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  growthPhotoDraft = { existingPaths: [], existingUrls: [], removedPaths: [], newPhotos: [] };
  $("#growthPhotos").value = "";
}

async function addGrowthPhotos(event) {
  const files = [...event.target.files]; event.target.value = "";
  if (!state.supabase || !state.household) return toast("사진은 로그인한 가족 공간에서 저장할 수 있어요");
  const available = MAX_GROWTH_PHOTOS - growthPhotoDraft.existingPaths.length - growthPhotoDraft.newPhotos.length;
  if (available <= 0) return toast("사진은 기록당 4장까지 올릴 수 있어요");
  for (const file of files.slice(0, available)) {
    if (!ALLOWED_GROWTH_PHOTO_TYPES.has(file.type)) { toast("JPG, PNG, WebP 또는 HEIC 사진만 올릴 수 있어요"); continue; }
    if (file.size > MAX_PHOTO_BYTES) { toast(`${file.name}은 10MB보다 커요`); continue; }
    const prepared = await prepareGrowthPhoto(file);
    growthPhotoDraft.newPhotos.push({ id: uid(), file: prepared, previewUrl: URL.createObjectURL(prepared) });
  }
  if (files.length > available) toast(`사진은 최대 ${MAX_GROWTH_PHOTOS}장까지 선택돼요`);
  renderGrowthPhotoPreview();
}

async function prepareGrowthPhoto(file) {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size < 600 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) { bitmap.close(); return file; }
    const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .84));
    return blob || file;
  } catch { return file; }
}

function renderGrowthPhotoPreview() {
  const root = $("#growthPhotoPreview"); const items = [];
  growthPhotoDraft.existingPaths.forEach((path, index) => items.push({ type: "existing", key: path, url: growthPhotoDraft.existingUrls[index] }));
  growthPhotoDraft.newPhotos.forEach((photo) => items.push({ type: "new", key: photo.id, url: photo.previewUrl }));
  root.innerHTML = items.map((item) => `<figure class="growth-photo-item"><img src="${escapeHtml(item.url || "")}" alt="선택한 도윤이 사진" /><button type="button" data-photo-type="${item.type}" data-photo-key="${escapeHtml(item.key)}" aria-label="사진 제거">×</button></figure>`).join("");
  $("#growthPhotoAddButton").hidden = items.length >= MAX_GROWTH_PHOTOS;
}

function removeGrowthPhoto(event) {
  const button = event.target.closest("[data-photo-key]"); if (!button) return;
  if (button.dataset.photoType === "existing") {
    const index = growthPhotoDraft.existingPaths.indexOf(button.dataset.photoKey);
    if (index >= 0) { growthPhotoDraft.removedPaths.push(growthPhotoDraft.existingPaths[index]); growthPhotoDraft.existingPaths.splice(index, 1); growthPhotoDraft.existingUrls.splice(index, 1); }
  } else {
    const index = growthPhotoDraft.newPhotos.findIndex((photo) => photo.id === button.dataset.photoKey);
    if (index >= 0) { URL.revokeObjectURL(growthPhotoDraft.newPhotos[index].previewUrl); growthPhotoDraft.newPhotos.splice(index, 1); }
  }
  renderGrowthPhotoPreview();
}

async function uploadGrowthPhotos(entryId) {
  const uploaded = [];
  for (const photo of growthPhotoDraft.newPhotos) {
    const type = photo.file.type || "image/jpeg"; const extension = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("heic") ? "heic" : "jpg";
    const path = `${state.household.id}/${entryId}/${uid()}.${extension}`;
    const { error } = await state.supabase.storage.from(GROWTH_PHOTO_BUCKET).upload(path, photo.file, { contentType: type, cacheControl: "3600", upsert: false });
    if (error) {
      if (uploaded.length) await state.supabase.storage.from(GROWTH_PHOTO_BUCKET).remove(uploaded);
      throw error;
    }
    uploaded.push(path);
  }
  return uploaded;
}

async function saveGrowthEntry(event) {
  event.preventDefault();
  if (state.supabase && !state.household) { $("#growthDialog").close(); return toast("먼저 가족 공간을 만들어주세요"); }
  const category = $("#growthCategory").value;
  const entry = {
    id: $("#growthId").value || uid(), title: $("#growthEntryTitle").value.trim() || defaultGrowthTitle(category),
    date: $("#growthDate").value, time: $("#growthTime").value, category,
    height: category === "성장" ? numberOrNull($("#growthHeight").value) : null,
    weight: category === "성장" ? numberOrNull($("#growthWeight").value) : null,
    head: category === "성장" ? numberOrNull($("#growthHead").value) : null,
    feedingMl: category === "수유·이유식" ? numberOrNull($("#growthFeedingMl").value) : null,
    sleepMinutes: category === "수면" ? numberOrNull($("#growthSleepMinutes").value) : null,
    temperature: category === "건강·병원" ? numberOrNull($("#growthTemperature").value) : null,
    diaperKind: category === "기저귀" ? $("#growthDiaperKind").value : "",
    note: $("#growthNote").value.trim(), photoPaths: [...growthPhotoDraft.existingPaths], photoUrls: [...growthPhotoDraft.existingUrls],
  };
  let uploadedPaths = [];
  if (state.supabase && state.session) {
    try { uploadedPaths = await uploadGrowthPhotos(entry.id); } catch { return toast("사진을 올리지 못했어요. 다시 시도해 주세요"); }
    entry.photoPaths.push(...uploadedPaths);
    const { error } = await state.supabase.from("growth_entries").upsert(toGrowthRemote(entry));
    if (error) {
      if (uploadedPaths.length) await state.supabase.storage.from(GROWTH_PHOTO_BUCKET).remove(uploadedPaths);
      return toast("성장 기록을 저장하지 못했어요. DB 업데이트를 확인해 주세요");
    }
    if (growthPhotoDraft.removedPaths.length) await state.supabase.storage.from(GROWTH_PHOTO_BUCKET).remove(growthPhotoDraft.removedPaths);
    await hydrateGrowthPhotoUrls([entry]);
  }
  const index = state.growthEntries.findIndex((item) => item.id === entry.id); if (index >= 0) state.growthEntries[index] = entry; else state.growthEntries.push(entry);
  if (!state.supabase) localStorage.setItem(GROWTH_STORAGE_KEY, JSON.stringify(state.growthEntries)); resetGrowthPhotoDraft(); $("#growthDialog").close(); renderGrowth(); toast("도윤이의 오늘을 기록했어요");
}
function numberOrNull(value) { return value === "" ? null : Number(value); }
async function deleteGrowthEntry() {
  const id = $("#growthId").value; if (!id || !confirm("이 성장 기록을 삭제할까요?")) return;
  const target = state.growthEntries.find((entry) => entry.id === id);
  if (state.supabase && state.session) {
    const { error } = await state.supabase.from("growth_entries").delete().eq("id", id); if (error) return toast("기록을 삭제하지 못했어요");
    if (target?.photoPaths?.length) await state.supabase.storage.from(GROWTH_PHOTO_BUCKET).remove(target.photoPaths);
  }
  state.growthEntries = state.growthEntries.filter((entry) => entry.id !== id); if (!state.supabase) localStorage.setItem(GROWTH_STORAGE_KEY, JSON.stringify(state.growthEntries)); resetGrowthPhotoDraft(); $("#growthDialog").close(); renderGrowth(); toast("성장 기록을 삭제했어요");
}

function openAccountDialog() { renderAccount(); $("#accountDialog").showModal(); }
function renderAccount() {
  const root = $("#accountContent");
  if (!state.supabase) { root.innerHTML = `<div class="account-card"><strong>이 기기에 안전하게 저장 중</strong><p>현재 일정은 이 브라우저에만 저장됩니다. 가족과 함께 쓰려면 README의 Supabase 연결을 완료해 주세요.</p></div>`; return; }
  if (!state.session) {
    root.innerHTML = `<button class="oauth-button" id="accountGoogleSignIn" type="button"><span class="google-mark">G</span>Google로 계속하기</button><div class="auth-divider"><span>또는 이메일로</span></div><div class="account-card"><strong>이메일로 시작하기</strong><p>로그인 링크를 보내드려요. 비밀번호는 필요 없습니다.</p><form class="account-form" id="loginForm"><input type="email" name="email" autocomplete="email" placeholder="name@example.com" required /><button>로그인 링크 받기</button></form></div>`;
    $("#accountGoogleSignIn").addEventListener("click", signInWithGoogle); $("#loginForm").addEventListener("submit", sendMagicLink); return;
  }
  if (!state.household) {
    root.innerHTML = `<div class="account-card"><strong>새 가족 공간 만들기</strong><form class="account-form" id="createHouseholdForm"><input id="householdName" placeholder="예: 도윤이네" required /><button>만들기</button></form></div><div class="account-card"><strong>초대 코드로 참여하기</strong><form class="account-form" id="joinHouseholdForm"><input id="inviteCode" placeholder="6자리 코드" maxlength="6" required /><button>참여하기</button></form></div>`;
    $("#createHouseholdForm").addEventListener("submit", createHousehold); $("#joinHouseholdForm").addEventListener("submit", joinHousehold); return;
  }
  root.innerHTML = `<div class="account-card"><strong>${escapeHtml(state.household.name)}</strong><p>가족에게 아래 초대 코드를 알려주세요.</p><div class="invite-code">${state.household.invite_code}</div></div><button class="secondary-button" id="logoutButton">로그아웃</button>`;
  $("#logoutButton").addEventListener("click", async () => { await state.supabase.auth.signOut(); $("#accountDialog").close(); });
}
function authRedirectUrl() { return `${location.origin}${location.pathname}`; }
async function signInWithGoogle() {
  const { error } = await state.supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: authRedirectUrl() } });
  if (error) toast("Google 로그인을 시작하지 못했어요");
}
async function sendMagicLink(event) { event.preventDefault(); const email = event.currentTarget.querySelector('input[type="email"]').value; const { error } = await state.supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirectUrl() } }); if (error) return toast("로그인 링크를 보내지 못했어요"); toast("이메일을 확인해 주세요"); event.currentTarget.reset(); }
async function createHousehold(event) { event.preventDefault(); const { error } = await state.supabase.rpc("create_household", { household_name: $("#householdName").value.trim() }); if (error) return toast("가족 공간을 만들지 못했어요"); await bootstrapData(); renderAccount(); toast("가족 공간을 만들었어요"); }
async function joinHousehold(event) { event.preventDefault(); const { error } = await state.supabase.rpc("join_household", { code: $("#inviteCode").value.trim().toUpperCase() }); if (error) return toast("초대 코드를 확인해 주세요"); await bootstrapData(); renderAccount(); toast("가족 공간에 참여했어요"); }

init();
