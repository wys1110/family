const DEFAULT_FAMILY_MEMBERS = [
  { name: "가족", color: "#5F8069" },
  { name: "아빠", color: "#B57D4B" },
  { name: "엄마", color: "#A56D78" },
  { name: "도윤", color: "#4B91A8" },
];
const MEMBER_COLORS = ["#5F8069", "#B57D4B", "#A56D78", "#4B91A8", "#76699A", "#A58A45", "#B5554E", "#4C857D"];
const STORAGE_KEY = "family-calendar-events-v1";
const MEMBER_STORAGE_KEY = "family-calendar-members-v1";
const GROWTH_STORAGE_KEY = "family-growth-entries-v1";
const BABY_STORAGE_KEY = "family-babies-v1";
const ACTIVE_BABY_KEY = "family-active-baby-v1";
const ACTIVE_VIEW_KEY = "family-active-view-v1";
const GROWTH_SUMMARY_PERIOD_KEY = "family-growth-summary-period-v1";
const GROWTH_PHOTO_BUCKET = "growth-photos";
const MAX_GROWTH_PHOTOS = 4;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_GROWTH_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const FAMILY_VERSES = [
  { text: "나와 내 집은 여호와를 섬기겠노라.", reference: "여호수아 24:15" },
  { text: "사랑은 오래 참고 사랑은 온유하며.", reference: "고린도전서 13:4" },
  { text: "모든 일을 사랑으로 행하라.", reference: "고린도전서 16:14" },
  { text: "자녀는 여호와의 기업이요 태의 열매는 그의 상급이로다.", reference: "시편 127:3" },
  { text: "마땅히 행할 길을 아이에게 가르치라.", reference: "잠언 22:6" },
  { text: "서로 친절하게 하며 불쌍히 여기며 서로 용서하기를.", reference: "에베소서 4:32" },
  { text: "사랑은 허다한 죄를 덮느니라.", reference: "베드로전서 4:8" },
  { text: "두 사람이 한 사람보다 나음은 그들이 수고함으로 좋은 상을 얻을 것임이라.", reference: "전도서 4:9" },
  { text: "형제가 연합하여 동거함이 어찌 그리 선하고 아름다운고.", reference: "시편 133:1" },
  { text: "평안의 매는 줄로 성령이 하나 되게 하신 것을 힘써 지키라.", reference: "에베소서 4:3" },
];
const state = { viewDate: startOfMonth(new Date()), selectedDate: dateKey(new Date()), activeView: storedActiveView(), quickMember: "가족", familyMembers: [...DEFAULT_FAMILY_MEMBERS], growthFilter: "all", growthSummaryPeriod: storedGrowthSummaryPeriod(), growthSummaryExpanded: false, activeBabyId: null, babies: [], events: [], growthEntries: [], supabase: null, session: null, household: null, authReady: false, onboardingPrompted: false };
const $ = (selector) => document.querySelector(selector);
const config = window.FAMILY_CONFIG || {};
let dragState = null;
let growthPhotoDraft = { existingPaths: [], existingUrls: [], removedPaths: [], newPhotos: [] };
let activeQuickCategory = null;
let activeQuickPresets = [];
let growthSaveInProgress = false;

function focusOnDesktop(selector) {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  setTimeout(() => $(selector)?.focus(), 100);
}

function setGrowthSaving(saving) {
  growthSaveInProgress = saving;
  const button = $("#growthSubmitButton");
  button.disabled = saving;
  button.setAttribute("aria-busy", String(saving));
  button.textContent = saving ? "저장 중…" : "기록하기";
}

function showGrowthComplete(message) {
  $("#growthCompleteMessage").textContent = message;
  const dialog = $("#growthCompleteDialog");
  if (!dialog.open) dialog.showModal();
}

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
function validColor(color) { return /^#[0-9a-f]{6}$/i.test(color || "") ? color.toUpperCase() : MEMBER_COLORS[0]; }
function memberColor(name) { return validColor(state.familyMembers.find((member) => member.name === name)?.color || DEFAULT_FAMILY_MEMBERS.find((member) => member.name === name)?.color); }
function memberStyle(name) { return `--member-color:${memberColor(name)}`; }
function storedActiveView() {
  try {
    const saved = localStorage.getItem(ACTIVE_VIEW_KEY);
    return saved === "growth" ? "growth" : "calendar";
  } catch { return "calendar"; }
}
function storedGrowthSummaryPeriod() {
  try {
    const saved = localStorage.getItem(GROWTH_SUMMARY_PERIOD_KEY);
    return ["day", "week", "month"].includes(saved) ? saved : "day";
  } catch { return "day"; }
}
function localMembers() {
  try {
    const saved = JSON.parse(localStorage.getItem(MEMBER_STORAGE_KEY) || "[]");
    return saved.length ? saved.map((member) => ({ ...member, color: validColor(member.color) })) : [...DEFAULT_FAMILY_MEMBERS];
  } catch { return [...DEFAULT_FAMILY_MEMBERS]; }
}
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
  lockMobileZoom();
  bindUi();
  renderDailyVerse();
  setInterval(renderDailyVerse, 60 * 1000);
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

function lockMobileZoom() {
  const preventGestureZoom = (event) => event.preventDefault();
  ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
    document.addEventListener(type, preventGestureZoom, { passive: false });
  });
}

function renderDailyVerse() {
  const today = new Date();
  const dayNumber = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
  const verse = FAMILY_VERSES[dayNumber % FAMILY_VERSES.length];
  $("#dailyVerseText").textContent = `“${verse.text}”`;
  $("#dailyVerseReference").textContent = verse.reference;
}

async function bootstrapData() {
  if (state.supabase && state.session) {
    const { data: memberships } = await state.supabase.from("household_members").select("household_id, households(id,name,invite_code)").limit(1);
    state.household = memberships?.[0]?.households || null;
    if (state.household) await loadRemoteData(); else { state.babies = []; state.events = []; state.growthEntries = []; state.familyMembers = [...DEFAULT_FAMILY_MEMBERS]; }
  } else {
    state.household = null;
    state.familyMembers = localMembers();
    state.babies = JSON.parse(localStorage.getItem(BABY_STORAGE_KEY) || "[]");
    state.events = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map(normalizeEvent);
    state.growthEntries = JSON.parse(localStorage.getItem(GROWTH_STORAGE_KEY) || "[]");
  }
  selectInitialBaby();
  render();
  updateAuthGate();
  if (state.session && !state.household && !state.onboardingPrompted) {
    state.onboardingPrompted = true;
    setTimeout(openAccountDialog, 250);
  }
}

async function loadRemoteData() {
  const [babiesResult, eventsResult, growthResult, membersResult] = await Promise.all([
    state.supabase.from("babies").select("*").eq("household_id", state.household.id).order("birth_date"),
    state.supabase.from("events").select("*").eq("household_id", state.household.id).order("event_date"),
    state.supabase.from("growth_entries").select("*").eq("household_id", state.household.id).order("entry_date", { ascending: false }),
    state.supabase.from("calendar_members").select("*").eq("household_id", state.household.id).order("sort_order"),
  ]);
  if (babiesResult.error) toast("아기 프로필을 불러오지 못했어요. DB 업데이트를 확인해 주세요"); else state.babies = babiesResult.data.map(fromBabyRemote);
  if (eventsResult.error) toast("일정을 불러오지 못했어요"); else state.events = eventsResult.data.map(fromRemote);
  if (growthResult.error) toast("성장일기를 불러오지 못했어요");
  else {
    state.growthEntries = growthResult.data.map(fromGrowthRemote);
    await hydrateGrowthPhotoUrls(state.growthEntries);
  }
  state.familyMembers = membersResult.error || !membersResult.data?.length
    ? [...DEFAULT_FAMILY_MEMBERS]
    : membersResult.data.map((row) => ({ id: row.id, name: row.name, color: validColor(row.color) }));
  if (!state.familyMembers.some((member) => member.name === state.quickMember)) state.quickMember = state.familyMembers[0]?.name || "가족";
}

function fromRemote(row) { return normalizeEvent({ id: row.id, title: row.title, date: row.event_date, endDate: row.event_end_date, time: row.event_time?.slice(0, 5) || "", member: row.member, note: row.note || "" }); }
function toRemote(event) { return { id: event.id, household_id: state.household.id, title: event.title, event_date: event.date, event_end_date: event.endDate || event.date, event_time: event.time || null, member: event.member, note: event.note || null, created_by: state.session.user.id }; }
function fromBabyRemote(row) { return { id: row.id, name: row.name, birthDate: row.birth_date, birthTime: row.birth_time?.slice(0, 5) || "", sex: row.sex || "", birthWeight: row.birth_weight_kg, birthHeight: row.birth_height_cm }; }
function toBabyRemote(baby) { return { id: baby.id, household_id: state.household.id, name: baby.name, birth_date: baby.birthDate, birth_time: baby.birthTime || null, sex: baby.sex || null, birth_weight_kg: baby.birthWeight || null, birth_height_cm: baby.birthHeight || null, created_by: state.session.user.id }; }
function fromGrowthRemote(row) {
  return {
    id: row.id, babyId: row.baby_id || null, title: row.title, date: row.entry_date, time: row.entry_time?.slice(0, 5) || "", category: row.category,
    height: row.height_cm, weight: row.weight_kg, head: row.head_cm, feedingMl: row.feeding_ml,
    feedingType: row.feeding_type || "", feedingSide: row.feeding_side || "", feedingMinutes: row.feeding_minutes,
    sleepMinutes: row.sleep_minutes, temperature: row.temperature_c, diaperKind: row.diaper_kind || "",
    note: row.note || "", photoPaths: row.photo_paths || [], photoUrls: [],
  };
}
function toGrowthRemote(entry) {
  return {
    id: entry.id, household_id: state.household.id, baby_id: entry.babyId || state.activeBabyId, title: entry.title, entry_date: entry.date,
    entry_time: entry.time || null, category: entry.category, height_cm: entry.height || null,
    weight_kg: entry.weight || null, head_cm: entry.head || null, feeding_ml: entry.feedingMl || null,
    feeding_type: entry.feedingType || null, feeding_side: entry.feedingSide || null, feeding_minutes: entry.feedingMinutes || null,
    sleep_minutes: entry.sleepMinutes || null, temperature_c: entry.temperature || null,
    diaper_kind: entry.diaperKind || null, note: entry.note || null, photo_paths: entry.photoPaths || [],
    created_by: state.session.user.id,
  };
}

function selectInitialBaby() {
  const saved = localStorage.getItem(ACTIVE_BABY_KEY);
  state.activeBabyId = state.babies.some((baby) => baby.id === saved) ? saved : state.babies[0]?.id || null;
  if (state.activeBabyId) localStorage.setItem(ACTIVE_BABY_KEY, state.activeBabyId);
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
  $("#bulkAddButton").addEventListener("click", openBulkEventDialog);
  $("#bulkEventForm").addEventListener("submit", saveBulkEvents);
  $("#bulkEventText").addEventListener("input", renderBulkEventPreview);
  $("#bulkDefaultDate").addEventListener("change", renderBulkEventPreview);
  $("#bulkDefaultMember").addEventListener("change", renderBulkEventPreview);
  $("#quickTimeButton").addEventListener("click", toggleQuickTime);
  $("#quickMemberChips").addEventListener("click", handleMemberControlClick);
  $("#eventForm").addEventListener("submit", saveEvent);
  $("#deleteEventButton").addEventListener("click", deleteEvent);
  $("#eventAllDay").addEventListener("change", syncAllDayControl);
  $("#eventHasRange").addEventListener("change", syncRangeControl);
  $("#eventDate").addEventListener("change", syncRangeDates);
  $("#eventEndDate").addEventListener("change", syncRangeDates);
  $("#eventMemberSelector").addEventListener("click", handleMemberControlClick);
  $("#memberForm").addEventListener("submit", saveFamilyMember);
  $("#memberColorPalette").addEventListener("click", selectMemberColor);
  document.querySelectorAll("[data-date-shortcut]").forEach((button) => button.addEventListener("click", () => applyDateShortcut(button.dataset.dateShortcut)));
  $("#growthForm").addEventListener("submit", saveGrowthEntry);
  $("#deleteGrowthButton").addEventListener("click", deleteGrowthEntry);
  $("#growthCategory").addEventListener("change", syncGrowthFields);
  $("#growthPhotos").addEventListener("change", addGrowthPhotos);
  $("#growthPhotoPreview").addEventListener("click", removeGrowthPhoto);
  document.querySelectorAll("[data-growth-quick]").forEach((button) => button.addEventListener("click", () => openGrowthQuick(button.dataset.growthQuick)));
  $("#addBabyButton").addEventListener("click", () => openBabyDialog());
  $("#babyEmptyState").addEventListener("click", (event) => { if (event.target.closest("[data-open-baby]")) openBabyDialog(); });
  $("#editBabyButton").addEventListener("click", () => openBabyDialog(activeBaby()));
  $("#babyForm").addEventListener("submit", saveBaby);
  $("#babySelector").addEventListener("click", selectBabyFromEvent);
  $("#growthFilterBar").addEventListener("click", changeGrowthFilter);
  $("#growthSummaryPeriod").addEventListener("click", changeGrowthSummaryPeriod);
  $("#growthSummaryToggle").addEventListener("click", toggleGrowthSummary);
  $("#quickPresetGrid").addEventListener("click", saveGrowthPresetFromEvent);
  $("#quickDetailButton").addEventListener("click", () => { $("#quickLogDialog").close(); openGrowthDialog(null, activeQuickCategory); });
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
}

function changeMonth(delta) { state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() + delta, 1); renderCalendar(); }
function render() { renderHeader(); renderMemberControls(); renderCalendar(); renderAgenda(); renderGrowth(); switchView(state.activeView); updateSyncBadge(); }
function renderMemberControls() {
  const quick = $("#quickMemberChips");
  const selector = $("#eventMemberSelector");
  quick.innerHTML = state.familyMembers.map((member) => `<button class="member-chip${member.name === state.quickMember ? " selected" : ""}" style="${memberStyle(member.name)}" type="button" data-member="${escapeHtml(member.name)}"><i></i>${escapeHtml(member.name)}</button>`).join("") + `<button class="member-add-chip" type="button" data-add-member aria-label="가족 구성원 추가">＋ 추가</button>`;
  const selected = $("#eventMember").value || state.familyMembers[0]?.name || "가족";
  selector.innerHTML = state.familyMembers.map((member) => `<button class="${member.name === selected ? "selected" : ""}" style="${memberStyle(member.name)}" type="button" data-member="${escapeHtml(member.name)}"><i></i>${escapeHtml(member.name)}</button>`).join("") + `<button class="member-selector-add" type="button" data-add-member><i>＋</i>구성원 추가</button>`;
}
function handleMemberControlClick(event) {
  const addButton = event.target.closest("[data-add-member]");
  if (addButton) return openMemberDialog();
  const button = event.target.closest("[data-member]");
  if (!button) return;
  if (event.currentTarget.id === "quickMemberChips") selectQuickMember(button.dataset.member);
  else selectEventMember(button.dataset.member);
}
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
  const nextView = view === "growth" ? "growth" : "calendar";
  state.activeView = nextView;
  try { localStorage.setItem(ACTIVE_VIEW_KEY, nextView); } catch { /* 저장이 막힌 브라우저에서는 현재 화면만 유지 */ }
  $("#calendarView").hidden = nextView !== "calendar";
  $("#growthView").hidden = nextView !== "growth";
  document.querySelectorAll(".view-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === nextView));
  $("#addEventButton").innerHTML = nextView === "calendar" ? "<span>＋</span> 일정 추가" : "<span>＋</span> 성장 기록";
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
    button.innerHTML = `<span class="day-number">${day.getDate()}</span>${firstEvent ? `<span class="day-event-preview ${firstEvent.endDate !== firstEvent.date ? "spans-range" : ""}" style="${memberStyle(firstEvent.member)}" data-event-id="${firstEvent.id}">${escapeHtml(firstEvent.title)}</span>` : `<span class="event-dots"></span>`}${dayEvents.length > 1 ? `<span class="more-events">+${dayEvents.length - 1}</span>` : ""}`;
    button.addEventListener("click", () => {
      state.selectedDate = key;
      if (day.getMonth() !== month) state.viewDate = startOfMonth(day);
      renderCalendar();
      renderAgenda();
      focusQuickEventInput();
    });
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

function focusQuickEventInput() {
  const input = $("#quickEventTitle");
  input.focus({ preventScroll: true });
  $("#quickEventForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderAgenda() {
  const date = parseDate(state.selectedDate); const events = state.events.filter((event) => eventOccursOn(event, state.selectedDate)).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  $("#agendaTitle").textContent = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(date);
  $("#agendaCount").textContent = `${events.length}개 일정`;
  $("#quickDateBadge").innerHTML = `<strong>${date.getDate()}</strong><span>${date.getMonth() + 1}월</span>`;
  const list = $("#agendaList");
  if (!events.length) { list.innerHTML = `<div class="empty-state"><strong>아직 일정이 없어요</strong><span>위 입력창에 이름만 적으면 바로 추가할 수 있어요.</span></div>`; return; }
  list.innerHTML = events.map((event) => `<article class="agenda-item" style="${memberStyle(event.member)}" data-id="${event.id}"><i class="bar"></i><button class="agenda-main" type="button"><span><strong>${escapeHtml(event.title)}</strong><small><i class="member-dot"></i>${escapeHtml(event.member)}${event.note ? ` · ${escapeHtml(event.note)}` : ""}</small></span><span class="event-when">${formatEventRange(event) ? `<b>${escapeHtml(formatEventRange(event))}</b>` : ""}<small>${event.time || "종일"}</small></span></button><button class="edit-event-button" type="button" aria-label="${escapeHtml(event.title)} 수정">편집</button><button class="drag-handle" type="button" aria-label="${escapeHtml(event.title)} 날짜 이동" title="날짜로 끌어 이동"><span aria-hidden="true">⠿</span></button></article>`).join("");
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

function openBulkEventDialog() {
  $("#bulkDefaultDate").value = state.selectedDate;
  $("#bulkDefaultMember").innerHTML = state.familyMembers.map((member) => `<option value="${escapeHtml(member.name)}"${member.name === state.quickMember ? " selected" : ""}>${escapeHtml(member.name)}</option>`).join("");
  $("#bulkEventText").value = "";
  renderBulkEventPreview();
  $("#bulkEventDialog").showModal();
  setTimeout(() => $("#bulkEventText").focus(), 100);
}

function checkedDateKey(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return dateKey(date);
}

function parseBulkEvents() {
  const defaultDate = $("#bulkDefaultDate").value || state.selectedDate;
  const defaultMember = $("#bulkDefaultMember").value || state.quickMember;
  const baseYear = parseDate(defaultDate).getFullYear();
  const lines = $("#bulkEventText").value.split(/\r?\n/).map((text, index) => ({ text: text.trim(), line: index + 1 })).filter((line) => line.text);
  const items = []; const errors = [];
  if (lines.length > 50) errors.push({ line: 0, message: "한 번에 최대 50개까지 추가할 수 있어요" });
  lines.slice(0, 50).forEach(({ text, line }) => {
    let rest = text; let startDate = defaultDate; let endDate = defaultDate;
    const full = rest.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s*~\s*(?:(\d{4})-)?(\d{1,2})-(\d{1,2}))?(?:\s+|$)/);
    const short = full ? null : rest.match(/^(\d{1,2})[/.](\d{1,2})(?:\s*~\s*(?:(\d{1,2})[/.])?(\d{1,2}))?(?:\s+|$)/);
    if (full) {
      startDate = checkedDateKey(Number(full[1]), Number(full[2]), Number(full[3]));
      const endYear = Number(full[4] || full[1]);
      endDate = full[5] ? checkedDateKey(endYear, Number(full[5]), Number(full[6])) : startDate;
      rest = rest.slice(full[0].length).trim();
    } else if (short) {
      const startMonth = Number(short[1]); const startDay = Number(short[2]);
      startDate = checkedDateKey(baseYear, startMonth, startDay);
      if (short[4]) {
        const endMonth = Number(short[3] || startMonth); const endDay = Number(short[4]);
        const endYear = endMonth < startMonth ? baseYear + 1 : baseYear;
        endDate = checkedDateKey(endYear, endMonth, endDay);
      } else endDate = startDate;
      rest = rest.slice(short[0].length).trim();
    }
    if (!startDate || !endDate || endDate < startDate) return errors.push({ line, message: "날짜를 확인해 주세요" });
    let time = "";
    const timeMatch = rest.match(/^([01]?\d|2[0-3]):([0-5]\d)(?:\s+|$)/);
    if (timeMatch) { time = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`; rest = rest.slice(timeMatch[0].length).trim(); }
    const parts = rest.split("|");
    let member = defaultMember;
    if (parts.length > 1) member = parts.pop().trim();
    const title = parts.join("|").trim();
    if (!title) return errors.push({ line, message: "일정 이름이 비어 있어요" });
    if (title.length > 60) return errors.push({ line, message: "일정 이름은 60자까지 가능해요" });
    if (!state.familyMembers.some((item) => item.name === member)) return errors.push({ line, message: `등록되지 않은 구성원: ${member}` });
    items.push({ id: uid(), title, date: startDate, endDate, time, member, note: "" });
  });
  return { items, errors, lineCount: lines.length };
}

function renderBulkEventPreview() {
  const root = $("#bulkEventPreview");
  const { items, errors, lineCount } = parseBulkEvents();
  const submit = $("#bulkEventSubmit");
  submit.textContent = items.length ? `${items.length}개 일정 추가` : "일정 추가";
  submit.disabled = !items.length || Boolean(errors.length);
  if (!lineCount) { root.innerHTML = `<p class="bulk-preview-empty">입력하면 저장될 일정이 여기에 표시돼요.</p>`; return; }
  const errorHtml = errors.length ? `<div class="bulk-errors">${errors.slice(0, 5).map((error) => `<p>${error.line ? `${error.line}번째 줄 · ` : ""}${escapeHtml(error.message)}</p>`).join("")}</div>` : "";
  const itemHtml = items.length ? `<div class="bulk-preview-list">${items.slice(0, 5).map((item) => `<article style="${memberStyle(item.member)}"><i></i><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(formatEventRange(item) || new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(parseDate(item.date)))} · ${escapeHtml(item.member)}${item.time ? ` · ${item.time}` : ""}</small></span></article>`).join("")}${items.length > 5 ? `<p>외 ${items.length - 5}개</p>` : ""}</div>` : "";
  root.innerHTML = errorHtml + itemHtml;
}

async function saveBulkEvents(event) {
  event.preventDefault();
  if (state.supabase && !state.household) return toast("먼저 가족 공간을 만들어주세요");
  const { items, errors } = parseBulkEvents();
  if (errors.length || !items.length) return renderBulkEventPreview();
  const submit = $("#bulkEventSubmit"); submit.disabled = true; submit.textContent = "저장 중…";
  if (state.supabase && state.session) {
    const { error } = await state.supabase.from("events").insert(items.map(toRemote));
    if (error) { submit.disabled = false; renderBulkEventPreview(); return toast("일정을 한꺼번에 저장하지 못했어요"); }
  }
  state.events.push(...items); persistLocal();
  state.selectedDate = items[0].date; state.viewDate = startOfMonth(parseDate(items[0].date));
  $("#bulkEventDialog").close(); render();
  toast(`${items.length}개 일정을 추가했어요`);
}

function openMemberDialog() {
  $("#memberForm").reset();
  $("#memberColor").value = MEMBER_COLORS[state.familyMembers.length % MEMBER_COLORS.length];
  renderMemberPalette();
  $("#memberDialog").showModal();
  setTimeout(() => $("#memberName").focus(), 100);
}
function renderMemberPalette() {
  const selected = validColor($("#memberColor").value);
  $("#memberColorPalette").innerHTML = MEMBER_COLORS.map((color) => `<button type="button" class="color-choice${color === selected ? " selected" : ""}" style="--choice-color:${color}" data-color="${color}" aria-label="${color} 색상"><i></i></button>`).join("");
}
function selectMemberColor(event) {
  const button = event.target.closest("[data-color]");
  if (!button) return;
  $("#memberColor").value = validColor(button.dataset.color);
  renderMemberPalette();
}
async function saveFamilyMember(event) {
  event.preventDefault();
  const name = $("#memberName").value.trim();
  const color = validColor($("#memberColor").value);
  if (!name) return;
  if (state.familyMembers.some((member) => member.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return toast("이미 등록된 이름이에요");
  const member = { id: uid(), name, color };
  if (state.supabase && state.session) {
    if (!state.household) return toast("먼저 가족 공간을 만들어주세요");
    const { data, error } = await state.supabase.from("calendar_members").insert({ id: member.id, household_id: state.household.id, name, color, sort_order: state.familyMembers.length, created_by: state.session.user.id }).select().single();
    if (error) return toast(error.message?.includes("calendar_members") ? "Supabase 가족 구성원 업데이트가 필요해요" : "가족 구성원을 추가하지 못했어요");
    member.id = data.id;
  }
  state.familyMembers.push(member);
  if (!state.supabase) localStorage.setItem(MEMBER_STORAGE_KEY, JSON.stringify(state.familyMembers));
  state.quickMember = member.name;
  $("#eventMember").value = member.name;
  renderMemberControls(); renderCalendar(); renderAgenda();
  $("#memberDialog").close();
  toast(`${name} 구성원을 추가했어요`);
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
  ghost.style.setProperty("--member-color", memberColor(event.member));
  ghost.innerHTML = `<i class="bar"></i><span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.member)} · 날짜 이동</small></span>`;
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
  selectEventMember(event?.member || state.familyMembers[0]?.name || "가족");
  $("#eventNote").value = event?.note || "";
  syncAllDayControl();
  syncRangeControl();
  syncDateShortcutSelection();
  $("#deleteEventButton").classList.toggle("visible", Boolean(event)); $("#eventDialog").showModal(); focusOnDesktop("#eventTitle");
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
  const baby = activeBaby();
  $("#babyEmptyState").hidden = Boolean(baby);
  $("#babyJournalContent").hidden = !baby;
  if (!baby) return;

  renderBabyProfile(baby);
  const allEntries = activeBabyEntries();
  renderTodayCareSummary(allEntries);
  renderGrowthSummary(allEntries);
  renderGrowthInsights(allEntries);
  renderRecentPhotos(allEntries);
  renderGrowthFilters();
  const entries = filterGrowthEntries(allEntries).sort((a, b) => `${b.date}T${b.time || "23:59"}`.localeCompare(`${a.date}T${a.time || "23:59"}`));
  $("#growthCount").textContent = `${entries.length}개 기록`;
  const list = $("#growthList");
  if (!entries.length) { list.innerHTML = `<div class="empty-state premium-empty"><strong>아직 표시할 기록이 없어요</strong><span>빠른 기록으로 ${escapeHtml(baby.name)}의 오늘을 남겨보세요.</span></div>`; return; }
  list.innerHTML = entries.map((entry) => {
    const preview = entry.photoUrls?.find(Boolean);
    const meta = growthEntryMeta(entry);
    return `<button class="growth-entry ${preview ? "has-photo" : ""}" data-id="${entry.id}">${preview ? `<img class="growth-thumbnail" src="${escapeHtml(preview)}" alt="" loading="lazy" />` : `<span class="growth-date"><strong>${parseDate(entry.date).getDate()}</strong>${parseDate(entry.date).getMonth() + 1}월</span>`}<span class="growth-body"><i>${escapeHtml(entry.category)}${entry.time ? ` · ${escapeHtml(entry.time)}` : ""}</i><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.note || meta || "기록 보기")}</small></span>${entry.photoPaths?.length ? `<span class="photo-count"><b>${entry.photoPaths.length}</b> photos</span>` : `<span class="growth-arrow">›</span>`}</button>`;
  }).join("");
  list.querySelectorAll(".growth-entry").forEach((item) => item.addEventListener("click", () => openGrowthDialog(state.growthEntries.find((entry) => entry.id === item.dataset.id))));
}

function activeBaby() { return state.babies.find((baby) => baby.id === state.activeBabyId) || null; }
function activeBabyEntries() {
  if (!state.activeBabyId) return [];
  return state.growthEntries.filter((entry) => entry.babyId === state.activeBabyId || (!entry.babyId && state.babies.length === 1));
}

function renderBabyProfile(baby) {
  $("#babySelector").hidden = state.babies.length < 2;
  $("#babySelector").innerHTML = state.babies.map((item) => `<button type="button" class="${item.id === baby.id ? "active" : ""}" data-baby-id="${item.id}"><span>${escapeHtml(item.name.charAt(0))}</span>${escapeHtml(item.name)}</button>`).join("");
  $("#babyMonogram").textContent = baby.name.charAt(0);
  $("#activeBabyName").textContent = baby.name;
  const days = daysFromBirth(baby.birthDate);
  const birth = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(parseDate(baby.birthDate));
  $("#babyBirthLabel").textContent = `${birth} 태어남`;
  if (days >= 0) {
    $("#babyDday").innerHTML = `<small>D-DAY</small><strong>D+${days}</strong>`;
    $("#babyAgeLabel").textContent = `태어난 지 ${days + 1}일째`;
  } else {
    $("#babyDday").innerHTML = `<small>만날 날까지</small><strong>D${days}</strong>`;
    $("#babyAgeLabel").textContent = `${Math.abs(days)}일 남았어요`;
  }
}

function daysFromBirth(birthDate) {
  const [y, m, d] = birthDate.split("-").map(Number); const today = new Date();
  return Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(y, m - 1, d)) / 86400000);
}

function renderTodayCareSummary(entries) {
  const today = dateKey(new Date()); const items = entries.filter((entry) => entry.date === today);
  const feeding = items.filter((entry) => entry.category === "수유·이유식");
  const sleep = items.filter((entry) => entry.category === "수면");
  const diapers = items.filter((entry) => entry.category === "기저귀");
  const feedingMl = feeding.reduce((sum, entry) => sum + (entry.feedingMl || 0), 0);
  const sleepMinutes = sleep.reduce((sum, entry) => sum + (entry.sleepMinutes || 0), 0);
  const cards = [
    ["수유", feedingMl ? `${feedingMl}ml` : `${feeding.length}회`, `${feeding.length}회 기록`],
    ["수면", sleepMinutes ? formatDuration(sleepMinutes) : `${sleep.length}회`, `${sleep.length}회 기록`],
    ["기저귀", `${diapers.length}회`, diapers.length ? "오늘 교체" : "기록 없음"],
    ["오늘", `${items.length}개`, "전체 기록"],
  ];
  $("#todayCareSummary").innerHTML = cards.map(([label, value, note]) => `<article><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join("");
}

function renderGrowthSummary(entries) {
  const periodDays = { day: 1, week: 7, month: 30 }[state.growthSummaryPeriod] || 1;
  const end = dateKey(new Date());
  const start = addDays(end, 1 - periodDays);
  const items = entries.filter((entry) => entry.date >= start && entry.date <= end);
  const feeding = items.filter((entry) => entry.category === "수유·이유식");
  const sleep = items.filter((entry) => entry.category === "수면");
  const diapers = items.filter((entry) => entry.category === "기저귀");
  const feedingMl = feeding.reduce((sum, entry) => sum + (entry.feedingMl || 0), 0);
  const feedingMinutes = feeding.reduce((sum, entry) => sum + (entry.feedingMinutes || 0), 0);
  const sleepMinutes = sleep.reduce((sum, entry) => sum + (entry.sleepMinutes || 0), 0);
  const wetDiapers = diapers.filter((entry) => entry.diaperKind?.includes("소변")).length;
  const dirtyDiapers = diapers.filter((entry) => entry.diaperKind?.includes("대변")).length;
  const photoCount = items.reduce((sum, entry) => sum + (entry.photoPaths?.length || 0), 0);
  const growthCount = items.filter((entry) => entry.category === "성장").length;
  const healthCount = items.filter((entry) => entry.category === "건강·병원").length;
  const momentCount = items.filter((entry) => entry.category === "첫 순간").length;
  const feedingNotes = [];
  if (feedingMl) feedingNotes.push(`젖병 ${feedingMl}ml`);
  if (feedingMinutes) feedingNotes.push(`모유 ${formatDuration(feedingMinutes)}`);
  const averageNote = periodDays > 1 ? `하루 평균 ${formatDuration(Math.round(sleepMinutes / periodDays))}` : `${sleep.length}회 기록`;
  const cards = [
    ["수유", `${feeding.length}회`, feedingNotes.join(" · ") || (feeding.length ? "수유량·시간 미입력" : "기록 없음"), "feed"],
    ["수면", formatDuration(sleepMinutes), sleepMinutes ? averageNote : "기록 없음", "sleep"],
    ["기저귀", `${diapers.length}회`, diapers.length ? `소변 ${wetDiapers} · 대변 ${dirtyDiapers}` : "기록 없음", "diaper"],
    ["전체 기록", `${items.length}개`, photoCount ? `사진 ${photoCount}장` : "사진 기록 없음", "all"],
  ];
  const formatRangeDay = (key) => { const date = parseDate(key); return `${date.getMonth() + 1}.${date.getDate()}`; };
  $("#growthSummaryRange").textContent = periodDays === 1 ? `오늘 · ${formatRangeDay(end)}` : `최근 ${periodDays}일 · ${formatRangeDay(start)}–${formatRangeDay(end)}`;
  $("#growthSummaryGrid").innerHTML = cards.map(([label, value, note, type]) => `<article class="summary-card ${type}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join("");
  $("#growthSummaryFooter").textContent = items.length ? `성장 ${growthCount}회 · 건강 ${healthCount}회 · 첫 순간 ${momentCount}회` : "이 기간에는 아직 기록이 없어요.";
  $("#growthSummaryPeriod").querySelectorAll("[data-summary-period]").forEach((button) => {
    const active = button.dataset.summaryPeriod === state.growthSummaryPeriod;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  syncGrowthSummaryDisclosure();
}

function changeGrowthSummaryPeriod(event) {
  const button = event.target.closest("[data-summary-period]");
  if (!button) return;
  state.growthSummaryPeriod = button.dataset.summaryPeriod;
  try { localStorage.setItem(GROWTH_SUMMARY_PERIOD_KEY, state.growthSummaryPeriod); } catch { /* 현재 화면에는 그대로 적용 */ }
  renderGrowthSummary(activeBabyEntries());
}

function toggleGrowthSummary() {
  state.growthSummaryExpanded = !state.growthSummaryExpanded;
  syncGrowthSummaryDisclosure();
}

function syncGrowthSummaryDisclosure() {
  $("#growthSummaryBody").hidden = !state.growthSummaryExpanded;
  $("#growthSummaryToggle").setAttribute("aria-expanded", String(state.growthSummaryExpanded));
  $("#growthSummaryToggleText").textContent = state.growthSummaryExpanded ? "접기" : "펼쳐보기";
}

function renderGrowthInsights(entries) {
  const measured = entries.filter((entry) => entry.height || entry.weight || entry.head).sort((a, b) => b.date.localeCompare(a.date));
  const latest = measured[0]; const baby = activeBaby();
  if (!latest) {
    $("#growthInsightRow").innerHTML = `<article class="growth-insight-empty"><div><p class="eyebrow">GROWTH</p><strong>첫 성장 측정을 남겨보세요</strong><span>키·몸무게·머리둘레의 변화를 이어서 볼 수 있어요.</span></div><button type="button" data-growth-quick="성장">측정 기록</button></article>`;
    $("#growthInsightRow [data-growth-quick]").addEventListener("click", () => openGrowthDialog(null, "성장"));
    return;
  }
  const values = [["키", latest.height, "cm"], ["몸무게", latest.weight, "kg"], ["머리둘레", latest.head, "cm"]];
  $("#growthInsightRow").innerHTML = `<div class="insight-title"><p class="eyebrow">LATEST GROWTH</p><strong>${escapeHtml(baby.name)}의 최근 성장</strong><span>${latest.date.replaceAll("-", ".")}</span></div>${values.map(([label, value, unit]) => `<article><span>${label}</span><strong>${value || "—"}<small>${value ? unit : ""}</small></strong></article>`).join("")}`;
}

function renderRecentPhotos(entries) {
  const photos = [...entries].sort((a, b) => b.date.localeCompare(a.date)).flatMap((entry) => (entry.photoUrls || []).map((url) => ({ url, entry }))).filter((item) => item.url).slice(0, 6);
  $("#recentPhotoSection").hidden = !photos.length;
  if (!photos.length) return;
  $("#recentPhotoCount").textContent = `${photos.length}장`;
  $("#recentPhotoGrid").innerHTML = photos.map(({ url, entry }) => `<button type="button" data-entry-id="${entry.id}"><img src="${escapeHtml(url)}" alt="${escapeHtml(entry.title)}" loading="lazy" /><span>${entry.date.slice(5).replace("-", ".")}</span></button>`).join("");
  $("#recentPhotoGrid").querySelectorAll("[data-entry-id]").forEach((button) => button.addEventListener("click", () => openGrowthDialog(state.growthEntries.find((entry) => entry.id === button.dataset.entryId))));
}

function filterGrowthEntries(entries) {
  if (state.growthFilter === "today") return entries.filter((entry) => entry.date === dateKey(new Date()));
  if (state.growthFilter === "photo") return entries.filter((entry) => entry.photoPaths?.length);
  if (state.growthFilter !== "all") return entries.filter((entry) => entry.category === state.growthFilter);
  return entries;
}

function renderGrowthFilters() {
  $("#growthFilterBar").querySelectorAll("[data-growth-filter]").forEach((button) => button.classList.toggle("active", button.dataset.growthFilter === state.growthFilter));
}

function changeGrowthFilter(event) {
  const button = event.target.closest("[data-growth-filter]"); if (!button) return;
  state.growthFilter = button.dataset.growthFilter; renderGrowth();
}

function selectBabyFromEvent(event) {
  const button = event.target.closest("[data-baby-id]"); if (!button) return;
  state.activeBabyId = button.dataset.babyId; state.growthFilter = "all";
  localStorage.setItem(ACTIVE_BABY_KEY, state.activeBabyId); renderGrowth();
}

function growthEntryMeta(entry) {
  const parts = [];
  if (entry.height) parts.push(`키 ${entry.height}cm`);
  if (entry.weight) parts.push(`몸무게 ${entry.weight}kg`);
  if (entry.head) parts.push(`머리둘레 ${entry.head}cm`);
  if (entry.feedingType) parts.push([entry.feedingType, entry.feedingSide].filter(Boolean).join(" "));
  if (entry.feedingMinutes) parts.push(`${entry.feedingMinutes}분`);
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

function quickPresets(category) {
  if (category === "수유·이유식") return [
    { label: "왼쪽 10분", note: "모유", title: "모유 수유", feedingType: "모유", feedingSide: "왼쪽", feedingMinutes: 10 },
    { label: "오른쪽 10분", note: "모유", title: "모유 수유", feedingType: "모유", feedingSide: "오른쪽", feedingMinutes: 10 },
    { label: "양쪽 20분", note: "모유", title: "모유 수유", feedingType: "모유", feedingSide: "양쪽", feedingMinutes: 20 },
    { label: "80 ml", note: "젖병", title: "젖병 수유", feedingType: "젖병", feedingMl: 80 },
    { label: "100 ml", note: "젖병", title: "젖병 수유", feedingType: "젖병", feedingMl: 100 },
    { label: "120 ml", note: "젖병", title: "젖병 수유", feedingType: "젖병", feedingMl: 120 },
  ];
  if (category === "수면") return [30, 60, 90, 120, 180, 480].map((minutes) => ({ label: formatDuration(minutes), note: minutes >= 180 ? "긴 잠" : "수면", title: "수면 기록", sleepMinutes: minutes }));
  if (category === "기저귀") return ["소변", "대변", "소변·대변"].map((kind) => ({ label: kind, note: "기저귀", title: "기저귀 교체", diaperKind: kind }));
  return [];
}

function openGrowthQuick(category) {
  if (!activeBaby()) { openBabyDialog(); toast("아기 프로필을 먼저 만들어주세요"); return; }
  const presets = quickPresets(category);
  if (!presets.length) { openGrowthDialog(null, category); return; }
  activeQuickCategory = category; activeQuickPresets = presets;
  const title = category === "수유·이유식" ? "수유를 바로 기록해요" : category === "수면" ? "얼마나 잤나요?" : "기저귀 상태를 골라요";
  $("#quickLogTitle").textContent = title;
  $("#quickLogCopy").textContent = "가장 가까운 값을 누르면 현재 시간으로 즉시 저장됩니다.";
  $("#quickPresetGrid").innerHTML = presets.map((preset, index) => `<button type="button" data-preset-index="${index}"><span>${escapeHtml(preset.label)}</span><small>${escapeHtml(preset.note)}</small></button>`).join("");
  $("#quickLogDialog").showModal();
}

async function saveGrowthPresetFromEvent(event) {
  const button = event.target.closest("[data-preset-index]"); if (!button) return;
  const preset = activeQuickPresets[Number(button.dataset.presetIndex)]; if (!preset) return;
  button.disabled = true;
  const now = new Date();
  const entry = {
    id: uid(), babyId: state.activeBabyId, title: preset.title, date: dateKey(now), time: now.toTimeString().slice(0, 5), category: activeQuickCategory,
    height: null, weight: null, head: null, feedingMl: preset.feedingMl || null, feedingType: preset.feedingType || "", feedingSide: preset.feedingSide || "", feedingMinutes: preset.feedingMinutes || null,
    sleepMinutes: preset.sleepMinutes || null, temperature: null, diaperKind: preset.diaperKind || "", note: "", photoPaths: [], photoUrls: [],
  };
  if (state.supabase && state.session) {
    const { error } = await state.supabase.from("growth_entries").upsert(toGrowthRemote(entry));
    if (error) { button.disabled = false; return toast("기록하지 못했어요. DB 업데이트를 확인해 주세요"); }
  }
  state.growthEntries.push(entry);
  if (!state.supabase) localStorage.setItem(GROWTH_STORAGE_KEY, JSON.stringify(state.growthEntries));
  $("#quickLogDialog").close(); renderGrowth(); showGrowthComplete(`${preset.label} 기록을 저장했어요.`);
}

function defaultGrowthTitle(category) {
  const name = activeBaby()?.name || "아기";
  return ({ "수유·이유식": "수유 기록", "수면": "수면 기록", "기저귀": "기저귀 기록", "건강·병원": "건강 기록", "성장": "성장 측정", "첫 순간": "새로운 첫 순간", "놀이": "오늘의 놀이", "기타": `${name} 기록` })[category] || `${name} 기록`;
}

function openGrowthDialog(entry = null, category = "첫 순간") {
  if (!entry && !activeBaby()) { openBabyDialog(); toast("아기 프로필을 먼저 만들어주세요"); return; }
  $("#growthDialogTitle").textContent = entry ? "성장 기록 수정" : "새 성장 기록";
  $("#growthDialogEyebrow").textContent = `${activeBaby()?.name || "아기"} 성장일기`;
  resetGrowthPhotoDraft();
  growthPhotoDraft.existingPaths = [...(entry?.photoPaths || [])];
  growthPhotoDraft.existingUrls = [...(entry?.photoUrls || [])];
  $("#growthId").value = entry?.id || "";
  $("#growthEntryTitle").value = entry?.title || "";
  $("#growthDate").value = entry?.date || dateKey(new Date());
  $("#growthTime").value = entry?.time || new Date().toTimeString().slice(0, 5);
  $("#growthCategory").value = entry?.category || category;
  $("#growthHeight").value = entry?.height || ""; $("#growthWeight").value = entry?.weight || ""; $("#growthHead").value = entry?.head || "";
  $("#growthFeedingMl").value = entry?.feedingMl || ""; $("#growthFeedingType").value = entry?.feedingType || ""; $("#growthFeedingSide").value = entry?.feedingSide || ""; $("#growthFeedingMinutes").value = entry?.feedingMinutes || ""; $("#growthSleepMinutes").value = entry?.sleepMinutes || "";
  $("#growthTemperature").value = entry?.temperature || ""; $("#growthDiaperKind").value = entry?.diaperKind || "";
  $("#growthNote").value = entry?.note || "";
  syncGrowthFields(); renderGrowthPhotoPreview();
  $("#deleteGrowthButton").classList.toggle("visible", Boolean(entry));
  const dialog = $("#growthDialog");
  dialog.showModal();
  dialog.scrollTop = 0;
  focusOnDesktop("#growthEntryTitle");
}

function syncGrowthFields() {
  const category = $("#growthCategory").value;
  document.querySelectorAll("[data-growth-fields]").forEach((group) => { group.hidden = group.dataset.growthFields !== category; });
  const placeholders = { "수유·이유식": "예: 분유를 맛있게 먹었어요", "수면": "예: 낮잠을 푹 잤어요", "기저귀": "예: 기저귀 갈았어요", "건강·병원": "예: 예방접종 다녀왔어요", "성장": "예: 한 달 성장 측정", "첫 순간": "예: 처음으로 뒤집었어요" };
  $("#growthEntryTitle").placeholder = placeholders[category] || `오늘의 ${activeBaby()?.name || "아기"}를 적어주세요`;
}

function openBabyDialog(baby = null) {
  $("#babyDialogTitle").textContent = baby ? "프로필 수정" : "아기 추가";
  $("#babySubmitButton").textContent = baby ? "변경사항 저장" : "프로필 만들기";
  $("#babyId").value = baby?.id || ""; $("#babyName").value = baby?.name || "";
  $("#babyBirthDate").value = baby?.birthDate || ""; $("#babyBirthTime").value = baby?.birthTime || "";
  $("#babySex").value = baby?.sex || ""; $("#babyBirthWeight").value = baby?.birthWeight || ""; $("#babyBirthHeight").value = baby?.birthHeight || "";
  $("#babyDialog").showModal(); focusOnDesktop("#babyName");
}

async function saveBaby(event) {
  event.preventDefault();
  if (state.supabase && !state.household) { $("#babyDialog").close(); return toast("먼저 가족 공간을 만들어주세요"); }
  const isNew = !$("#babyId").value;
  const baby = { id: $("#babyId").value || uid(), name: $("#babyName").value.trim(), birthDate: $("#babyBirthDate").value, birthTime: $("#babyBirthTime").value, sex: $("#babySex").value, birthWeight: numberOrNull($("#babyBirthWeight").value), birthHeight: numberOrNull($("#babyBirthHeight").value) };
  if (state.supabase && state.session) {
    const { error } = await state.supabase.from("babies").upsert(toBabyRemote(baby));
    if (error) return toast("아기 프로필을 저장하지 못했어요. DB 업데이트를 확인해 주세요");
    if (isNew && state.babies.length === 0) await state.supabase.from("growth_entries").update({ baby_id: baby.id }).eq("household_id", state.household.id).is("baby_id", null);
  }
  const index = state.babies.findIndex((item) => item.id === baby.id); if (index >= 0) state.babies[index] = baby; else state.babies.push(baby);
  if (isNew && state.babies.length === 1) state.growthEntries.forEach((entry) => { if (!entry.babyId) entry.babyId = baby.id; });
  state.activeBabyId = baby.id; localStorage.setItem(ACTIVE_BABY_KEY, baby.id);
  if (!state.supabase) { localStorage.setItem(BABY_STORAGE_KEY, JSON.stringify(state.babies)); localStorage.setItem(GROWTH_STORAGE_KEY, JSON.stringify(state.growthEntries)); }
  $("#babyDialog").close(); renderGrowth(); toast(isNew ? `${baby.name}의 성장일기를 시작했어요` : "아기 프로필을 수정했어요");
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
  root.innerHTML = items.map((item) => `<figure class="growth-photo-item"><img src="${escapeHtml(item.url || "")}" alt="선택한 ${escapeHtml(activeBaby()?.name || "아기")} 사진" /><button type="button" data-photo-type="${item.type}" data-photo-key="${escapeHtml(item.key)}" aria-label="사진 제거">×</button></figure>`).join("");
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
  if (growthSaveInProgress) return;
  setGrowthSaving(true);
  try {
    if (state.supabase && !state.household) { $("#growthDialog").close(); return toast("먼저 가족 공간을 만들어주세요"); }
    const category = $("#growthCategory").value;
    const entry = {
    id: $("#growthId").value || uid(), babyId: state.growthEntries.find((item) => item.id === $("#growthId").value)?.babyId || state.activeBabyId, title: $("#growthEntryTitle").value.trim() || defaultGrowthTitle(category),
    date: $("#growthDate").value, time: $("#growthTime").value, category,
    height: category === "성장" ? numberOrNull($("#growthHeight").value) : null,
    weight: category === "성장" ? numberOrNull($("#growthWeight").value) : null,
    head: category === "성장" ? numberOrNull($("#growthHead").value) : null,
    feedingMl: category === "수유·이유식" ? numberOrNull($("#growthFeedingMl").value) : null,
    feedingType: category === "수유·이유식" ? $("#growthFeedingType").value : "",
    feedingSide: category === "수유·이유식" ? $("#growthFeedingSide").value : "",
    feedingMinutes: category === "수유·이유식" ? numberOrNull($("#growthFeedingMinutes").value) : null,
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
    if (!state.supabase) localStorage.setItem(GROWTH_STORAGE_KEY, JSON.stringify(state.growthEntries));
    resetGrowthPhotoDraft();
    $("#growthDialog").close();
    renderGrowth();
    showGrowthComplete(`${activeBaby()?.name || "아기"}의 성장 기록을 안전하게 저장했어요.`);
  } catch (error) {
    console.error(error);
    toast("성장 기록을 저장하지 못했어요. 다시 시도해 주세요");
  } finally {
    setGrowthSaving(false);
  }
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
