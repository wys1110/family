const MEMBERS = ["가족", "아빠", "엄마", "도윤"];
const STORAGE_KEY = "family-calendar-events-v1";
const state = { viewDate: startOfMonth(new Date()), selectedDate: dateKey(new Date()), events: [], supabase: null, session: null, household: null };
const $ = (selector) => document.querySelector(selector);
const config = window.FAMILY_CONFIG || {};

function dateKey(date) {
  const y = date.getFullYear();
  return `${y}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function escapeHtml(value = "") { return value.replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]); }
function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 1800); }

async function init() {
  bindUi();
  if (config.supabaseUrl && config.supabaseAnonKey && window.supabase) {
    state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data } = await state.supabase.auth.getSession();
    state.session = data.session;
    state.supabase.auth.onAuthStateChange((_event, session) => { state.session = session; bootstrapData(); });
  }
  await bootstrapData();
}

async function bootstrapData() {
  if (state.supabase && state.session) {
    const { data: memberships } = await state.supabase.from("household_members").select("household_id, households(id,name,invite_code)").limit(1);
    state.household = memberships?.[0]?.households || null;
    if (state.household) await loadRemoteEvents(); else state.events = [];
  } else {
    state.household = null;
    state.events = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  }
  render();
}

async function loadRemoteEvents() {
  const { data, error } = await state.supabase.from("events").select("*").eq("household_id", state.household.id).order("event_date");
  if (error) return toast("일정을 불러오지 못했어요");
  state.events = data.map(fromRemote);
}

function fromRemote(row) { return { id: row.id, title: row.title, date: row.event_date, time: row.event_time?.slice(0, 5) || "", member: row.member, note: row.note || "" }; }
function toRemote(event) { return { id: event.id, household_id: state.household.id, title: event.title, event_date: event.date, event_time: event.time || null, member: event.member, note: event.note || null, created_by: state.session.user.id }; }

function bindUi() {
  $("#prevMonth").addEventListener("click", () => changeMonth(-1));
  $("#nextMonth").addEventListener("click", () => changeMonth(1));
  $("#todayButton").addEventListener("click", () => { state.viewDate = startOfMonth(new Date()); state.selectedDate = dateKey(new Date()); render(); });
  $("#addEventButton").addEventListener("click", () => openEventDialog());
  $("#accountButton").addEventListener("click", openAccountDialog);
  $("#eventForm").addEventListener("submit", saveEvent);
  $("#deleteEventButton").addEventListener("click", deleteEvent);
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
}

function changeMonth(delta) { state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() + delta, 1); renderCalendar(); }
function render() { renderHeader(); renderCalendar(); renderAgenda(); updateSyncBadge(); }
function renderHeader() {
  const today = new Date();
  $("#todayLabel").textContent = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(today);
  const todayEvents = state.events.filter((event) => event.date === dateKey(today));
  $("#todaySummary").textContent = todayEvents.length ? `오늘은 ${todayEvents.length}개의 약속이 있어요` : "오늘도 우리답게";
}
function updateSyncBadge() { $("#syncDot").classList.toggle("online", Boolean(state.session && state.household)); }

function renderCalendar() {
  const year = state.viewDate.getFullYear(); const month = state.viewDate.getMonth();
  $("#monthLabel").textContent = `${year}년 ${month + 1}월`;
  const first = new Date(year, month, 1); const start = new Date(year, month, 1 - first.getDay());
  const grid = $("#calendarGrid"); grid.innerHTML = "";
  for (let i = 0; i < 42; i++) {
    const day = new Date(start); day.setDate(start.getDate() + i); const key = dateKey(day);
    const dayEvents = state.events.filter((event) => event.date === key);
    const button = document.createElement("button"); button.className = "calendar-day";
    if (day.getMonth() !== month) button.classList.add("outside");
    if (key === state.selectedDate) button.classList.add("selected");
    if (key === dateKey(new Date())) button.classList.add("today");
    button.setAttribute("aria-label", `${day.getMonth() + 1}월 ${day.getDate()}일, 일정 ${dayEvents.length}개`);
    button.innerHTML = `<span class="day-number">${day.getDate()}</span><span class="event-dots">${dayEvents.slice(0, 3).map((e) => `<i class="event-dot ${e.member}"></i>`).join("")}</span>`;
    button.addEventListener("click", () => { state.selectedDate = key; if (day.getMonth() !== month) state.viewDate = startOfMonth(day); renderCalendar(); renderAgenda(); });
    grid.appendChild(button);
  }
}

function renderAgenda() {
  const date = parseDate(state.selectedDate); const events = state.events.filter((event) => event.date === state.selectedDate).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  $("#agendaTitle").textContent = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(date);
  $("#agendaCount").textContent = `${events.length}개 일정`;
  const list = $("#agendaList");
  if (!events.length) { list.innerHTML = `<div class="empty-state">아직 일정이 없어요.<br />가족의 소중한 계획을 남겨보세요.</div>`; return; }
  list.innerHTML = events.map((event) => `<button class="agenda-item" data-id="${event.id}"><i class="bar ${event.member}"></i><span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.member)}${event.note ? ` · ${escapeHtml(event.note)}` : ""}</small></span><span class="time">${event.time || "종일"}</span></button>`).join("");
  list.querySelectorAll(".agenda-item").forEach((item) => item.addEventListener("click", () => openEventDialog(state.events.find((event) => event.id === item.dataset.id))));
}

function openEventDialog(event = null) {
  $("#eventDialogTitle").textContent = event ? "일정 수정" : "새 일정";
  $("#eventId").value = event?.id || ""; $("#eventTitle").value = event?.title || ""; $("#eventDate").value = event?.date || state.selectedDate; $("#eventTime").value = event?.time || ""; $("#eventMember").value = event?.member || MEMBERS[0]; $("#eventNote").value = event?.note || "";
  $("#deleteEventButton").classList.toggle("visible", Boolean(event)); $("#eventDialog").showModal(); setTimeout(() => $("#eventTitle").focus(), 100);
}

async function saveEvent(event) {
  event.preventDefault();
  if (state.supabase && !state.household) { $("#eventDialog").close(); return toast("먼저 가족 공간을 만들어주세요"); }
  const item = { id: $("#eventId").value || uid(), title: $("#eventTitle").value.trim(), date: $("#eventDate").value, time: $("#eventTime").value, member: $("#eventMember").value, note: $("#eventNote").value.trim() };
  if (state.supabase && state.session) {
    const { error } = await state.supabase.from("events").upsert(toRemote(item)); if (error) return toast("저장하지 못했어요");
  }
  const index = state.events.findIndex((e) => e.id === item.id); if (index >= 0) state.events[index] = item; else state.events.push(item);
  persistLocal(); state.selectedDate = item.date; state.viewDate = startOfMonth(parseDate(item.date)); $("#eventDialog").close(); render(); toast("일정을 저장했어요");
}

async function deleteEvent() {
  const id = $("#eventId").value; if (!id || !confirm("이 일정을 삭제할까요?")) return;
  if (state.supabase && state.session) { const { error } = await state.supabase.from("events").delete().eq("id", id); if (error) return toast("삭제하지 못했어요"); }
  state.events = state.events.filter((event) => event.id !== id); persistLocal(); $("#eventDialog").close(); render(); toast("일정을 삭제했어요");
}
function persistLocal() { if (!state.supabase) localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events)); }

function openAccountDialog() { renderAccount(); $("#accountDialog").showModal(); }
function renderAccount() {
  const root = $("#accountContent");
  if (!state.supabase) { root.innerHTML = `<div class="account-card"><strong>이 기기에 안전하게 저장 중</strong><p>현재 일정은 이 브라우저에만 저장됩니다. 가족과 함께 쓰려면 README의 Supabase 연결을 완료해 주세요.</p></div>`; return; }
  if (!state.session) {
    root.innerHTML = `<div class="account-card"><strong>이메일로 시작하기</strong><p>로그인 링크를 보내드려요. 비밀번호는 필요 없습니다.</p><form class="account-form" id="loginForm"><input type="email" id="loginEmail" placeholder="name@example.com" required /><button>로그인 링크 받기</button></form></div>`;
    $("#loginForm").addEventListener("submit", sendMagicLink); return;
  }
  if (!state.household) {
    root.innerHTML = `<div class="account-card"><strong>새 가족 공간 만들기</strong><form class="account-form" id="createHouseholdForm"><input id="householdName" placeholder="예: 도윤이네" required /><button>만들기</button></form></div><div class="account-card"><strong>초대 코드로 참여하기</strong><form class="account-form" id="joinHouseholdForm"><input id="inviteCode" placeholder="6자리 코드" maxlength="6" required /><button>참여하기</button></form></div>`;
    $("#createHouseholdForm").addEventListener("submit", createHousehold); $("#joinHouseholdForm").addEventListener("submit", joinHousehold); return;
  }
  root.innerHTML = `<div class="account-card"><strong>${escapeHtml(state.household.name)}</strong><p>가족에게 아래 초대 코드를 알려주세요.</p><div class="invite-code">${state.household.invite_code}</div></div><button class="secondary-button" id="logoutButton">로그아웃</button>`;
  $("#logoutButton").addEventListener("click", async () => { await state.supabase.auth.signOut(); $("#accountDialog").close(); });
}
async function sendMagicLink(event) { event.preventDefault(); const email = $("#loginEmail").value; const { error } = await state.supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } }); if (error) return toast("로그인 링크를 보내지 못했어요"); toast("이메일을 확인해 주세요"); }
async function createHousehold(event) { event.preventDefault(); const { error } = await state.supabase.rpc("create_household", { household_name: $("#householdName").value.trim() }); if (error) return toast("가족 공간을 만들지 못했어요"); await bootstrapData(); renderAccount(); toast("가족 공간을 만들었어요"); }
async function joinHousehold(event) { event.preventDefault(); const { error } = await state.supabase.rpc("join_household", { code: $("#inviteCode").value.trim().toUpperCase() }); if (error) return toast("초대 코드를 확인해 주세요"); await bootstrapData(); renderAccount(); toast("가족 공간에 참여했어요"); }

init();
