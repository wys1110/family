# Growth History and Upcoming Schedule Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the current calendar and growth flows while removing the iOS tab focus ghost, exposing editable historical growth measurements, and adding up to 20 upcoming family events.

**Architecture:** Keep `app.js` as the owner of tab switching and calendar event selection, and keep `growth-inline-chart.js` as the owner of the recent-growth card. New UI elements call the existing `openGrowthDialog(entry)` and `openEventDialog(event)` functions, so Supabase schemas and persistence code do not change. Upcoming-event filtering is a self-contained pure function inside `app.js`; rendering is separate.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Supabase-backed in-memory state, Vitest source-contract and pure-function tests, in-app browser verification.

## Global Constraints

- Preserve existing calendar, growth graph, growth list, add/edit dialogs, and Supabase persistence behavior.
- Do not create, modify, or delete existing user data during verification.
- Do not change Supabase tables, RLS, authentication, photos, family/baby selection, AI, or notifications.
- Use the self-hosted SUIT Variable font for all text and keep the current emoji system.
- Keep both 별빛 밤 and 포근한 숲 themes working.
- Do not modify or commit `HANDOFF.md` or `.superpowers/`.
- Do not add a screen-specific temporary stylesheet.
- Keep keyboard `focus-visible`; only clear residual focus after touch or pen tab activation.
- Upcoming events include ongoing/today/future family events, exclude expired/invalid events, sort deterministically, and show at most 20.

---

## File Map

- `app.js`: touch/pen tab-focus cleanup, pure upcoming-event selection, upcoming list rendering, and integration into `render()`.
- `index.html`: upcoming-event section shell and clearer optional growth-record name copy.
- `growth-inline-chart.js`: historical measurement rows, five-row collapse/expand state, and reuse of existing edit/add dialog entry points.
- `growth-inline-chart.css`: historical measurement list layout and responsive/touch styling.
- `growth-inline-approved-polish.css`: final label and control sizing overrides for the inline growth card.
- `growth-edit-sheet-polish.css`: stronger visual priority for measurement inputs without changing form fields or order.
- `premium-ui.css`: upcoming-event timeline/card styling using current design tokens.
- `config.js`: cache versions for every changed dynamic module stylesheet/script.
- `test/view-tab-touch-focus.test.js`: tab input-mode behavior contract.
- `test/growth-inline-history.test.js`: historical measurement list and existing-dialog reuse contract.
- `test/upcoming-events.test.js`: pure filtering/sorting/limit behavior plus HTML/rendering contract.

---

### Task 1: Remove the iOS residual focus ring from inactive tabs

**Files:**
- Modify: `app.js:405-420`
- Create: `test/view-tab-touch-focus.test.js`

**Interfaces:**
- Consumes: existing `.view-tab[data-view]` buttons and `switchView(view)`.
- Produces: `releaseTouchTabFocus(event: PointerEvent): void`; touch and pen focus is blurred on the next animation frame, mouse and keyboard focus is untouched.

- [ ] **Step 1: Write the failing source-contract test**

```js
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const app = readFileSync("app.js", "utf8");

describe("top-level tab touch focus", () => {
  test("clears residual focus only after touch or pen activation", () => {
    expect(app).toContain("function releaseTouchTabFocus(event)");
    expect(app).toContain('["touch", "pen"].includes(event.pointerType)');
    expect(app).toContain("requestAnimationFrame(() => event.currentTarget.blur())");
    expect(app).toContain('button.addEventListener("pointerup", releaseTouchTabFocus)');
  });

  test("keeps the existing active and aria-selected state contract", () => {
    expect(app).toContain('button.classList.toggle("active", active)');
    expect(app).toContain('button.setAttribute("aria-selected", String(active))');
    expect(app).not.toContain('.view-tab:focus { outline: none');
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npx vitest run test/view-tab-touch-focus.test.js`

Expected: FAIL because `releaseTouchTabFocus` and its `pointerup` binding do not exist.

- [ ] **Step 3: Add the input-specific focus cleanup**

Insert before `bindUi()` and replace the one-line tab binding with the expanded binding:

```js
function releaseTouchTabFocus(event) {
  if (!["touch", "pen"].includes(event.pointerType)) return;
  requestAnimationFrame(() => event.currentTarget.blur());
}

function bindUi() {
  // existing bindings remain unchanged
  document.querySelectorAll(".view-tab").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
    button.addEventListener("pointerup", releaseTouchTabFocus);
  });
  // remaining existing bindings remain unchanged
}
```

Do not add `blur()` to `switchView()`: programmatic and keyboard navigation must retain focus.

- [ ] **Step 4: Run focused and related tests**

Run: `npx vitest run test/view-tab-touch-focus.test.js test/global-design-harmony.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.js test/view-tab-touch-focus.test.js
git commit -m "fix: clear residual touch focus from tabs"
```

---

### Task 2: Add visible editable growth-measurement history

**Files:**
- Modify: `growth-inline-chart.js:1-280`
- Modify: `growth-inline-chart.css:1-240`
- Modify: `growth-inline-approved-polish.css:1-110`
- Modify: `growth-edit-sheet-polish.css:90-240`
- Modify: `index.html:450-475`
- Modify: `config.js:145-165`
- Create: `test/growth-inline-history.test.js`

**Interfaces:**
- Consumes: existing `measurementEntries(): GrowthEntry[]`, `openGrowthDialog(entry?, category?)`, `formatDate()`, and `formatValue()` inside `growth-inline-chart.js`.
- Produces: module-local `historyExpanded: boolean`, `historyRows(entries): string`, and buttons with `data-growth-inline-entry="<id>"`, `data-growth-inline-history-toggle`, and existing `data-growth-inline-action="add"`.

- [ ] **Step 1: Write the failing history contract test**

```js
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const script = readFileSync("growth-inline-chart.js", "utf8");
const css = readFileSync("growth-inline-chart.css", "utf8");
const polish = readFileSync("growth-edit-sheet-polish.css", "utf8");
const index = readFileSync("index.html", "utf8");
const config = readFileSync("config.js", "utf8");

describe("inline growth measurement history", () => {
  test("renders five recent rows and an explicit expand control", () => {
    expect(script).toContain("let historyExpanded = false");
    expect(script).toContain("const historyRows = (entries) =>");
    expect(script).toContain("historyExpanded ? ordered : ordered.slice(0, 5)");
    expect(script).toContain('data-growth-inline-history-toggle');
    expect(script).toContain("전체 기록 보기");
    expect(script).toContain("최근 기록만 보기");
  });

  test("routes rows and new measurements through existing dialogs", () => {
    expect(script).toContain('data-growth-inline-entry="${escapeText(entry.id)}"');
    expect(script).toContain("if (point) openEntry(point.dataset.growthInlineEntry)");
    expect(script).toContain('data-growth-inline-action="add"');
    expect(script).toContain('openGrowthDialog(null, "성장")');
  });

  test("adds accessible touch-sized history styling and form emphasis", () => {
    expect(css).toContain(".growth-inline-history-list");
    expect(css).toContain("min-height: 56px");
    expect(css).toContain(".growth-inline-history-values");
    expect(polish).toContain('#growthDialog[data-simple-category="성장"] [data-growth-fields="성장"]');
    expect(index).toContain('기록 이름 <small class="field-optional">선택 · 비워두면 분류에 맞게 자동 입력</small>');
  });

  test("bumps every changed growth module", () => {
    expect(config).toContain('{ name: "growth-edit-sheet-polish", version: "20260722-measurement-focus-v1", script: false }');
    expect(config).toContain('{ name: "growth-inline-chart", version: "20260722-history-v1" }');
    expect(config).toContain('{ name: "growth-inline-approved-polish", version: "20260722-history-v1", script: false }');
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npx vitest run test/growth-inline-history.test.js`

Expected: FAIL because history markup, styles, copy, and cache versions do not exist.

- [ ] **Step 3: Add collapsed/expanded history state and renderer**

Near the existing render state in `growth-inline-chart.js`, add:

```js
let historyExpanded = false;

const historyRows = (entries) => {
  const ordered = [...entries].reverse();
  const visibleEntries = historyExpanded ? ordered : ordered.slice(0, 5);
  const rows = visibleEntries.map((entry) => {
    const accessibleValues = Object.keys(metrics)
      .map((key) => `${metrics[key].label} ${formatValue(entry[key], key)}`)
      .join(", ");
    return `
      <button type="button" class="growth-inline-history-row"
        data-growth-inline-entry="${escapeText(entry.id)}"
        aria-label="${escapeText(formatDate(entry.date, true))} ${escapeText(accessibleValues)} 기록 수정">
        <time datetime="${escapeText(entry.date)}">${escapeText(formatDate(entry.date, true))}${entry.time ? `<small>${escapeText(entry.time)}</small>` : ""}</time>
        <span class="growth-inline-history-values">
          ${Object.keys(metrics).map((key) => `<b><small>${escapeText(metrics[key].label)}</small>${escapeText(formatValue(entry[key], key))}</b>`).join("")}
        </span>
        <i>수정</i>
      </button>`;
  }).join("");
  const toggle = ordered.length > 5
    ? `<button type="button" class="growth-inline-history-toggle" data-growth-inline-history-toggle aria-expanded="${historyExpanded}">${historyExpanded ? "최근 기록만 보기" : `전체 기록 보기 (${ordered.length})`}</button>`
    : "";
  return `
    <section class="growth-inline-history" aria-labelledby="growthInlineHistoryTitle">
      <header><div><h4 id="growthInlineHistoryTitle">측정 기록</h4><p>최근 기록부터 확인하고 수정할 수 있어요.</p></div><span>${ordered.length}개</span></header>
      <div class="growth-inline-history-list">${rows}</div>
      <div class="growth-inline-history-footer">${toggle}<button type="button" data-growth-inline-action="add">새 측정 기록</button></div>
    </section>`;
};
```

Append `${historyRows(entries)}` after the existing chart section inside the non-empty `.growth-inline-card` template.

- [ ] **Step 4: Wire the expand/collapse control without changing persistence**

Add this branch before existing action and point handling:

```js
const historyToggle = event.target.closest("[data-growth-inline-history-toggle]");
if (historyToggle) {
  historyExpanded = !historyExpanded;
  lastSignature = "";
  queueRender();
  return;
}
```

Keep historical row buttons on the existing `data-growth-inline-entry` route. Do not create another edit function.

- [ ] **Step 5: Add the history layout**

Append to `growth-inline-chart.css`:

```css
.growth-inline-history { margin-top: 14px; padding-top: 14px; border-top: 1px solid color-mix(in srgb, var(--label) 9%, transparent); }
.growth-inline-history > header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:9px; }
.growth-inline-history h4 { margin:0; font-size:16px; }
.growth-inline-history p { margin:3px 0 0; color:var(--secondary); font-size:10px; }
.growth-inline-history > header > span { flex:0 0 auto; color:var(--secondary); font-size:10px; font-weight:750; }
.growth-inline-history-list { display:grid; gap:7px; }
.growth-inline-history-row { display:grid; grid-template-columns:82px minmax(0,1fr) auto; align-items:center; gap:10px; width:100%; min-height:56px; padding:8px 10px; border:1px solid color-mix(in srgb,var(--label) 9%,transparent); border-radius:15px; color:var(--label); background:color-mix(in srgb,var(--surface) 90%,transparent); text-align:left; }
.growth-inline-history-row time { display:grid; gap:2px; font-size:11px; font-weight:760; font-variant-numeric:tabular-nums; }
.growth-inline-history-row time small { color:var(--secondary); font-size:9px; }
.growth-inline-history-values { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px; min-width:0; }
.growth-inline-history-values b { display:grid; gap:2px; min-width:0; font-size:11px; font-weight:760; }
.growth-inline-history-values b small { overflow:hidden; color:var(--secondary); font-size:8px; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
.growth-inline-history-row > i { color:var(--blue); font-size:10px; font-style:normal; font-weight:760; }
.growth-inline-history-footer { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
.growth-inline-history-footer button { min-height:42px; padding:0 12px; border:1px solid color-mix(in srgb,var(--label) 10%,transparent); border-radius:13px; color:var(--blue); background:var(--surface); font-size:10px; font-weight:750; }
@media (max-width:380px) { .growth-inline-history-row { grid-template-columns:72px minmax(0,1fr); } .growth-inline-history-row > i { display:none; } }
```

Use `growth-inline-approved-polish.css` only for final small-screen font sizes if its existing higher-specificity rules override the new history rules.

- [ ] **Step 6: Clarify optional record naming and emphasize measurements**

In `index.html`, change only the visible label copy:

```html
<label>기록 이름 <small class="field-optional">선택 · 비워두면 분류에 맞게 자동 입력</small><input id="growthEntryTitle" maxlength="60" placeholder="예: 처음으로 뒤집었어요" /></label>
```

Append to `growth-edit-sheet-polish.css`:

```css
#growthDialog[data-simple-category="성장"] [data-growth-fields="성장"] {
  border-color: color-mix(in srgb, var(--blue) 24%, transparent);
  background: color-mix(in srgb, var(--blue) 5%, var(--surface));
  box-shadow: 0 8px 24px color-mix(in srgb, var(--blue) 7%, transparent);
}
#growthDialog[data-simple-category="성장"] [data-growth-fields="성장"] .field-group-title { color:var(--blue); }
```

Do not reorder or remove form fields.

- [ ] **Step 7: Bump changed module versions**

In `config.js`, set exactly:

```js
{ name: "growth-edit-sheet-polish", version: "20260722-measurement-focus-v1", script: false },
{ name: "growth-inline-chart", version: "20260722-history-v1" },
{ name: "growth-inline-approved-polish", version: "20260722-history-v1", script: false },
```

- [ ] **Step 8: Run focused and related tests**

Run: `npx vitest run test/growth-inline-history.test.js test/growth-dedup.test.js test/global-design-harmony.test.js`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add growth-inline-chart.js growth-inline-chart.css growth-inline-approved-polish.css growth-edit-sheet-polish.css index.html config.js test/growth-inline-history.test.js
git commit -m "feat: expose editable growth measurement history"
```

---

### Task 3: Add the upcoming family schedule list

**Files:**
- Modify: `app.js:515-530, 670-710`
- Modify: `index.html:90-110`
- Modify: `premium-ui.css:120-170`
- Modify: `config.js:140-155`
- Create: `test/upcoming-events.test.js`

**Interfaces:**
- Consumes: `state.events`, `dateKey(new Date())`, `memberStyle(member)`, `formatEventRange(event)`, `escapeHtml(value)`, and `openEventDialog(event)`.
- Produces: `upcomingEvents(events: Event[], todayKey: string, limit = 20): Event[]` and `renderUpcomingEvents(): void`.

- [ ] **Step 1: Write pure selection and source-contract tests**

```js
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const app = readFileSync("app.js", "utf8");
const index = readFileSync("index.html", "utf8");
const css = readFileSync("premium-ui.css", "utf8");
const config = readFileSync("config.js", "utf8");

function loadUpcomingEvents() {
  const start = app.indexOf("function upcomingEvents(");
  const end = app.indexOf("function renderUpcomingEvents(");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const context = {};
  vm.runInNewContext(`${app.slice(start, end)}; this.upcomingEvents = upcomingEvents;`, context);
  return context.upcomingEvents;
}

describe("upcoming family events", () => {
  test("includes ongoing, today, and future events but excludes expired and invalid events", () => {
    const select = loadUpcomingEvents();
    const events = [
      { id:"ongoing", title:"여행", date:"2026-07-20", endDate:"2026-07-23", time:"" },
      { id:"today", title:"진료", date:"2026-07-22", time:"10:00" },
      { id:"future", title:"예방접종", date:"2026-07-24", time:"09:00" },
      { id:"expired", title:"지난 일정", date:"2026-07-20", endDate:"2026-07-21", time:"" },
      { id:"invalid", title:"잘못된 일정", date:"2026-02-31", time:"" },
    ];
    expect(select(events, "2026-07-22").map((event) => event.id)).toEqual(["ongoing", "today", "future"]);
  });

  test("orders timed events before all-day events and limits output to 20", () => {
    const select = loadUpcomingEvents();
    const events = Array.from({ length: 22 }, (_, index) => ({ id:String(index), title:`일정 ${index}`, date:"2026-07-23", time:index === 0 ? "" : `${String(8 + (index % 10)).padStart(2,"0")}:00` }));
    const result = select(events, "2026-07-22");
    expect(result).toHaveLength(20);
    expect(result.at(-1).id).not.toBe("0");
  });

  test("renders an accessible section that reuses the event editor", () => {
    expect(index).toContain('class="upcoming-events-section"');
    expect(index).toContain('id="upcomingEventsTitle"');
    expect(index).toContain('id="upcomingEventsList"');
    expect(app).toContain("function renderUpcomingEvents()");
    expect(app).toContain("openEventDialog(event)");
    expect(app).toContain("renderUpcomingEvents();");
    expect(css).toContain(".upcoming-event-item");
    expect(css).toContain("min-height: 56px");
  });

  test("bumps the premium UI stylesheet version", () => {
    expect(config).toContain('{ name: "premium-ui", version: "20260722-upcoming-v1", script: false }');
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npx vitest run test/upcoming-events.test.js`

Expected: FAIL because the pure function and section do not exist.

- [ ] **Step 3: Add the upcoming section shell after the selected-date agenda**

In `index.html`, after the existing `.agenda-section`, add:

```html
<section class="upcoming-events-section" aria-labelledby="upcomingEventsTitle">
  <div class="section-heading">
    <div><p class="eyebrow">오늘부터 가까운 순서</p><h2 id="upcomingEventsTitle">다가오는 일정</h2></div>
    <span id="upcomingEventsCount" class="count-badge">0개 일정</span>
  </div>
  <div id="upcomingEventsList" class="upcoming-events-list"></div>
</section>
```

- [ ] **Step 4: Implement the self-contained pure selector**

Add before `renderUpcomingEvents()` in `app.js`:

```js
function upcomingEvents(events, todayKey, limit = 20) {
  const validDateKey = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  };
  const normalized = events.filter((event) => {
    const endDate = event.endDate || event.date;
    return validDateKey(event.date) && validDateKey(endDate) && endDate >= todayKey;
  });
  return normalized.sort((left, right) => {
    const leftEnd = left.endDate || left.date;
    const rightEnd = right.endDate || right.date;
    const leftSortDate = left.date < todayKey && leftEnd >= todayKey ? todayKey : left.date;
    const rightSortDate = right.date < todayKey && rightEnd >= todayKey ? todayKey : right.date;
    const leftOngoing = left.date < todayKey && leftEnd >= todayKey;
    const rightOngoing = right.date < todayKey && rightEnd >= todayKey;
    return leftSortDate.localeCompare(rightSortDate)
      || Number(rightOngoing) - Number(leftOngoing)
      || left.date.localeCompare(right.date)
      || (left.time || "99:99").localeCompare(right.time || "99:99")
      || String(left.title || "").localeCompare(String(right.title || ""), "ko")
      || String(left.id || "").localeCompare(String(right.id || ""));
  }).slice(0, Math.max(0, limit));
}
```

- [ ] **Step 5: Render rows and reuse the existing event dialog**

Add after `renderAgenda()`:

```js
function renderUpcomingEvents() {
  const events = upcomingEvents(state.events, dateKey(new Date()), 20);
  const list = $("#upcomingEventsList");
  $("#upcomingEventsCount").textContent = `${events.length}개 일정`;
  if (!events.length) {
    list.innerHTML = '<div class="empty-state"><strong>다가오는 일정이 없어요</strong><span>새 일정을 추가하면 가까운 순서로 표시돼요.</span></div>';
    return;
  }
  list.innerHTML = events.map((event) => {
    const date = parseDate(event.date < dateKey(new Date()) ? dateKey(new Date()) : event.date);
    const day = new Intl.DateTimeFormat("ko-KR", { month:"numeric", day:"numeric", weekday:"short" }).format(date);
    const range = formatEventRange(event);
    const when = event.time || "종일";
    return `<button class="upcoming-event-item" type="button" data-id="${escapeHtml(event.id)}" style="${memberStyle(event.member)}" aria-label="${escapeHtml(`${day} ${event.title} ${when} 일정 수정`)}"><i class="bar"></i><time datetime="${escapeHtml(event.date)}">${escapeHtml(day)}<small>${escapeHtml(when)}</small></time><span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.member)}${range ? ` · ${escapeHtml(range)}` : ""}</small></span><b>수정</b></button>`;
  }).join("");
  list.querySelectorAll(".upcoming-event-item").forEach((button) => {
    const event = state.events.find((entry) => entry.id === button.dataset.id);
    button.addEventListener("click", () => openEventDialog(event));
  });
}
```

Change `render()` to include `renderUpcomingEvents()` immediately after `renderAgenda()`.

- [ ] **Step 6: Style the compact one-column timeline**

Append to `premium-ui.css`:

```css
.upcoming-events-section { padding:28px 2px 0; }
.upcoming-events-list { display:grid; gap:8px; }
.upcoming-event-item { display:grid; grid-template-columns:4px 78px minmax(0,1fr) auto; align-items:center; gap:10px; width:100%; min-height:56px; padding:9px 11px; overflow:hidden; border:1px solid var(--ui-border); border-radius:17px; color:var(--label); background:var(--ui-card); box-shadow:var(--ui-shadow-sm); text-align:left; }
.upcoming-event-item > .bar { align-self:stretch; border-radius:999px; background:var(--member-color,var(--blue)); }
.upcoming-event-item time { display:grid; gap:2px; font-size:11px; font-weight:760; font-variant-numeric:tabular-nums; }
.upcoming-event-item time small,.upcoming-event-item > span small { color:var(--secondary); font-size:9px; font-weight:650; }
.upcoming-event-item > span { display:grid; min-width:0; gap:3px; }
.upcoming-event-item > span strong { overflow:hidden; font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
.upcoming-event-item > span small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.upcoming-event-item > b { color:var(--blue); font-size:10px; font-weight:760; }
@media (max-width:380px) { .upcoming-event-item { grid-template-columns:4px 70px minmax(0,1fr); } .upcoming-event-item > b { display:none; } }
```

- [ ] **Step 7: Bump the premium UI cache version**

In `config.js`, set:

```js
{ name: "premium-ui", version: "20260722-upcoming-v1", script: false },
```

- [ ] **Step 8: Run focused and calendar tests**

Run: `npx vitest run test/upcoming-events.test.js test/calendar-event-range.test.js test/global-design-harmony.test.js`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app.js index.html premium-ui.css config.js test/upcoming-events.test.js
git commit -m "feat: show upcoming family events"
```

---

### Task 4: Verify both themes and the authenticated interaction paths

**Files:**
- Modify only if browser evidence reveals a scoped regression in the files already listed above.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified tab, growth-history, and upcoming-event behavior without mutating user data.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npm run check
git diff --check
```

Expected: all Vitest files pass, JS/TS checks exit 0, and `git diff --check` prints no errors.

- [ ] **Step 2: Open the authenticated app with a unique refresh URL**

Navigate the existing in-app browser tab to:

```text
http://127.0.0.1:4173/?__refresh=growth-history-upcoming-20260722
```

Do not sign out and do not inspect browser storage/cookies.

- [ ] **Step 3: Verify tab focus behavior without data writes**

At 390×844 and 430×932 where available:

- Tap 일정, 성장, 일정, 성장.
- Confirm exactly one `.view-tab.active` and one `aria-selected="true"` exist.
- Confirm the inactive prior tab has no residual blue focus outline.
- Use keyboard focus once where available and confirm a visible focus ring remains.

- [ ] **Step 4: Verify growth history without saving**

In both 별빛 밤 and 포근한 숲:

- Confirm the graph is unchanged.
- Confirm five or fewer rows show initially and the count reflects all measurements.
- Expand and collapse the complete list.
- Open a middle historical row and confirm its date, height, weight, and head values populate the existing edit dialog.
- Close the dialog without saving.
- Open `새 측정 기록`, confirm `기록 이름` is optional and the three measurement inputs have stronger visual priority, then close without saving.

- [ ] **Step 5: Verify upcoming events without saving**

In both themes:

- Confirm the section is at the bottom of 일정.
- Confirm at most 20 rows, chronological order, and no public-holiday-only synthetic rows.
- Open one row and confirm the existing event edit dialog receives the matching title/date/time.
- Close without saving.
- Confirm the empty state contract via automated tests rather than deleting data.

- [ ] **Step 6: Verify responsive geometry**

For 390×844, 430×932, 768×1024, and 1440×900 where the browser surface supports each viewport, record:

```js
({
  viewport: [innerWidth, innerHeight],
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  bodyFont: getComputedStyle(document.body).fontFamily,
  activeTabs: document.querySelectorAll(".view-tab.active").length,
})
```

Required: `scrollWidth <= clientWidth`, SUIT's `Family UI` alias is first, and `activeTabs === 1`.

- [ ] **Step 7: Inspect browser logs**

Expected: no new JavaScript errors while switching tabs, expanding history, or opening/closing existing dialogs.

- [ ] **Step 8: Commit any evidence-driven scoped correction, then rerun all checks**

If no correction is needed, do not create an empty commit. If a correction is needed:

```bash
git add app.js index.html growth-inline-chart.js growth-inline-chart.css growth-inline-approved-polish.css growth-edit-sheet-polish.css premium-ui.css config.js test/view-tab-touch-focus.test.js test/growth-inline-history.test.js test/upcoming-events.test.js
git commit -m "fix: address growth and schedule browser findings"
npm test
npm run check
git diff --check
```

Expected: all checks pass again.
