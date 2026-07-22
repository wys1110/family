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

function renderUpcomingEventsInVm(events) {
  const start = app.indexOf("function upcomingEvents(");
  const end = app.indexOf("function openBulkEventDialog(");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const count = { textContent: "기존 값" };
  const buttons = [];
  let markup = "기존 목록";
  let openedEvent = null;
  const list = {
    get innerHTML() { return markup; },
    set innerHTML(value) {
      markup = value;
      buttons.length = 0;
      for (const match of value.matchAll(/data-id="([^"]*)"/g)) {
        const listeners = {};
        buttons.push({
          dataset: { id: match[1] },
          addEventListener: (type, listener) => { listeners[type] = listener; },
          click: () => listeners.click?.(),
        });
      }
    },
    querySelectorAll: () => buttons,
  };
  const nodes = { "#upcomingEventsCount": count, "#upcomingEventsList": list };
  const context = {
    state: { events },
    dateKey: () => "2026-07-22",
    parseDate: (key) => {
      const [year, month, day] = key.split("-").map(Number);
      return new Date(year, month - 1, day);
    },
    formatEventRange: (event) => event.endDate && event.endDate !== event.date ? `${event.date}–${event.endDate}` : "",
    escapeHtml: (value) => String(value),
    memberStyle: () => "",
    openEventDialog: (event) => { openedEvent = event; },
    $: (selector) => nodes[selector],
  };
  vm.runInNewContext(`${app.slice(start, end)}; renderUpcomingEvents();`, context);
  return { count, list, buttons, openedEvent: () => openedEvent };
}

describe("upcoming family events", () => {
  test("includes ongoing, today, and future events but excludes expired and invalid events", () => {
    const select = loadUpcomingEvents();
    const events = [
      { id: "ongoing", title: "여행", date: "2026-07-20", endDate: "2026-07-23", time: "" },
      { id: "today", title: "진료", date: "2026-07-22", time: "10:00" },
      { id: "future", title: "예방접종", date: "2026-07-24", time: "09:00" },
      { id: "expired", title: "지난 일정", date: "2026-07-20", endDate: "2026-07-21", time: "" },
      { id: "invalid-date", title: "잘못된 날짜", date: "2026-02-31", time: "" },
      { id: "invalid-range", title: "잘못된 기간", date: "2026-07-25", endDate: "2026-07-23", time: "" },
    ];

    expect(select(events, "2026-07-22").map((event) => event.id)).toEqual(["ongoing", "today", "future"]);
  });

  test("excludes synthetic public holidays from the family schedule", () => {
    const select = loadUpcomingEvents();
    const events = [
      { id: "family", title: "가족 식사", date: "2026-07-23", time: "18:00" },
      { id: "public-holiday-2026-08-15", title: "광복절", date: "2026-08-15", isPublicHoliday: true },
      { id: "public-holiday-legacy", title: "합성 공휴일", date: "2026-08-16" },
    ];

    expect(select(events, "2026-07-22").map((event) => event.id)).toEqual(["family"]);
  });

  test("orders timed events before all-day events with deterministic ties and limits output to 20", () => {
    const select = loadUpcomingEvents();
    const events = [
      { id: "all-day", title: "종일 일정", date: "2026-07-23", time: "" },
      { id: "b", title: "같은 일정", date: "2026-07-23", time: "09:00" },
      { id: "a", title: "같은 일정", date: "2026-07-23", time: "09:00" },
      ...Array.from({ length: 19 }, (_, index) => ({
        id: `later-${index}`,
        title: `일정 ${index}`,
        date: "2026-07-24",
        time: "10:00",
      })),
    ];

    const result = select(events, "2026-07-22");
    expect(result).toHaveLength(20);
    expect(result.slice(0, 3).map((event) => event.id)).toEqual(["a", "b", "all-day"]);
  });

  test("renders the empty projection with a zero count and guidance", () => {
    const { count, list } = renderUpcomingEventsInVm([]);

    expect(count.textContent).toBe("0개 일정");
    expect(list.innerHTML).toBe('<div class="empty-state"><strong>다가오는 일정이 없어요</strong><span>새 일정을 추가하면 가까운 순서로 표시돼요.</span></div>');
  });

  test("renders an ongoing event from its actual start date and opens that exact event", () => {
    const event = { id: "ongoing", title: "여행", date: "2026-07-20", endDate: "2026-07-23", time: "", member: "가족" };
    const { list, buttons, openedEvent } = renderUpcomingEventsInVm([event]);
    const startLabel = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }).format(new Date(2026, 6, 20));

    expect(list.innerHTML).toContain(`<time datetime="2026-07-20">${startLabel}<small>종일</small></time>`);
    expect(list.innerHTML).toContain(`aria-label="${startLabel} 여행 종일 일정 수정"`);
    expect(buttons).toHaveLength(1);
    buttons[0].click();
    expect(openedEvent()).toBe(event);
  });

  test("renders an accessible section that reuses the event editor", () => {
    expect(index).toContain('class="upcoming-events-section"');
    expect(index).toContain('aria-labelledby="upcomingEventsTitle"');
    expect(index).toContain('id="upcomingEventsTitle"');
    expect(index).toContain('id="upcomingEventsList"');
    expect(app).toContain("function renderUpcomingEvents()");
    expect(app).toContain("openEventDialog(event)");
    expect(app).toContain("renderAgenda(); renderUpcomingEvents();");
    expect(css).toContain(".upcoming-event-item");
    expect(css).toContain("min-height: 56px");
    expect(css).toContain(".upcoming-event-item:focus-visible");
    expect(css).toContain("html[data-family-theme=\"night\"] .upcoming-event-item");
  });

  test("bumps the premium UI stylesheet version", () => {
    expect(config).toContain('{ name: "premium-ui", version: "20260722-upcoming-v1", script: false }');
  });

  test("loads the core app with the growth and upcoming delivery version", () => {
    expect(index).toContain('<script src="app.js?v=20260722-growth-actions-v3"></script>');
    expect(index).not.toContain('app.js?v=20260718-logic-audit-v1');
  });
});
