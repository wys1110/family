# 블랙 테마 주말 요일 색상 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 블랙 테마 캘린더에서 일요일은 빨강, 토요일은 파랑으로 헤더와 날짜 숫자를 표시한다.

**Architecture:** 캘린더의 기존 일요일→토요일 DOM 순서를 활용해 블랙 테마 CSS에서 첫 열과 마지막 열을 선택한다. JS 렌더링과 다른 테마는 변경하지 않는다.

**Tech Stack:** 정적 HTML/CSS, Vitest, npm run check, Playwright 기반 브라우저 데모 검증.

## Global Constraints

- 블랙 테마 선택자 범위는 `html[data-family-theme-choice="black"]`로 제한한다.
- 오늘 날짜의 흰색 원형 배지와 공휴일 빨강, 일정 블락 멤버 색상은 유지한다.
- 기존 작업 트리의 사용자 변경사항은 수정하지 않는다.

---

### Task 1: Add weekend color regression coverage and CSS

**Files:**
- Create: `docs/superpowers/specs/2026-08-03-black-theme-weekend-colors-design.md`
- Create: `docs/superpowers/plans/2026-08-03-black-theme-weekend-colors.md`
- Modify: `test/monochrome-theme.test.js`
- Modify: `theme-system.css`

**Interfaces:**
- Consumes: existing `.weekdays` seven-column grid and `.calendar-day` seven-column grid.
- Produces: black-theme weekend color selectors for the existing calendar DOM.

- [ ] **Step 1: Write the failing test**

Add one test to `test/monochrome-theme.test.js` asserting the black-theme selectors and exact color values:

```js
test("colors black calendar weekends like a dark calendar", () => {
  expect(themeSystem).toContain('html[data-family-theme-choice="black"] #calendarView .weekdays span:first-child');
  expect(themeSystem).toContain('html[data-family-theme-choice="black"] #calendarView .weekdays span:last-child');
  expect(themeSystem).toContain('html[data-family-theme-choice="black"] #calendarView .calendar-day:nth-child(7n + 1):not(.today) .day-number');
  expect(themeSystem).toContain('html[data-family-theme-choice="black"] #calendarView .calendar-day:nth-child(7n):not(.today) .day-number');
  expect(themeSystem).toContain('color: #ff6b78 !important;');
  expect(themeSystem).toContain('color: #6ea8ff !important;');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- --run test/monochrome-theme.test.js
```

Expected: the new test fails because `theme-system.css` does not yet contain the weekend selectors.

- [ ] **Step 3: Implement the minimal CSS**

Append the following black-theme rules near the existing calendar event exception in `theme-system.css`:

```css
html[data-family-theme-choice="black"] #calendarView .weekdays span:first-child,
html[data-family-theme-choice="black"] #calendarView .calendar-day:nth-child(7n + 1):not(.today) .day-number {
  color: #ff6b78 !important;
}

html[data-family-theme-choice="black"] #calendarView .weekdays span:last-child,
html[data-family-theme-choice="black"] #calendarView .calendar-day:nth-child(7n):not(.today) .day-number {
  color: #6ea8ff !important;
}
```

Use `7n + 1` and `7n` for every calendar row, rather than only the first/last grid child.

- [ ] **Step 4: Run focused tests and static checks**

Run:

```bash
npm test -- --run test/monochrome-theme.test.js test/theme-v2.test.js test/theme-color-guard.test.js
npm run check
git diff --check
```

Expected: all focused tests pass, the theme color guard and syntax/type checks pass, and `git diff --check` has no output.

- [ ] **Step 5: Verify the 390px browser demo**

Start `python3 -m http.server 4178`, select the black theme in `?demo=1`, open the calendar, and evaluate:

```js
({
  sundayHeader: getComputedStyle(document.querySelector("#calendarView .weekdays span:first-child")).color,
  saturdayHeader: getComputedStyle(document.querySelector("#calendarView .weekdays span:last-child")).color,
  sundayNumber: getComputedStyle(document.querySelector("#calendarView .calendar-day:nth-child(7n + 1):not(.today) .day-number")).color,
  saturdayNumber: getComputedStyle(document.querySelector("#calendarView .calendar-day:nth-child(7n):not(.today) .day-number")).color,
})
```

Expected: Sunday values are `rgb(255, 107, 120)` and Saturday values are `rgb(110, 168, 255)` for non-today dates.

- [ ] **Step 6: Commit the implementation**

```bash
git add docs/superpowers/specs/2026-08-03-black-theme-weekend-colors-design.md docs/superpowers/plans/2026-08-03-black-theme-weekend-colors.md test/monochrome-theme.test.js theme-system.css
git commit -m "블랙 테마 주말 요일 색상 적용"
```
