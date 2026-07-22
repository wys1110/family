# Family App Global Design Harmony

## Status

Approved for implementation by the user on 2026-07-22 after an authenticated review of all five top-level tabs.

## Subject and Audience

Family is a shared daily-life journal for family members who record schedules, baby care, growth, and stories primarily on mobile. Its visual thesis is a starlit family storybook: the daily Bible verse is the signature element, while data-entry controls stay quiet and practical.

## Goals

- Remove floating controls that cover calendar dates, growth content, story copy, and request-admin controls.
- Keep full refresh available without making it a persistent overlay.
- Preserve the daily verse as the app signature while reducing repeated header height outside the calendar.
- Remove the gold cross-shaped growth divider that reads as a close or delete affordance.
- Make page entrance motion feel immediate rather than temporarily unreadable.
- Replace generic English eyebrow labels with clear Korean copy except where English is the subject.

## Non-goals

- No changes to authentication, Supabase, family data, AI responses, or persistence logic.
- No changes to zoom prevention policy.
- No new font and no mixing of Korean text fonts.
- No redesign of dialogs, forms, calendar data, or growth data structure.
- No new standalone stylesheet.

## Chosen Approach

Three floating-action approaches were considered:

1. Remove full refresh completely.
2. Keep it floating but hide it selectively by page.
3. Preserve it as a topbar utility and move the context action into document flow.

Approach 3 is selected. It preserves discoverability and function, avoids viewport overlap on every page, and fits the existing notification/account utility group.

## Visual System

### Color

Existing theme tokens remain authoritative:

- Starlit ink: `#071425`
- Deep navy paper: `#0e2138`
- Moon blue: `#5b88d1`
- Story gold: `#e8c77a`
- Gentle teal: `#79d5c1`
- Forest paper: `#fff8f3`

No new accent color is introduced. The refresh utility inherits the current theme color and uses the same circular geometry as notification and account utilities.

### Typography

Self-hosted SUIT Variable remains the only text face through the existing `Family UI` alias. The existing 24/18/16/15/14/13px hierarchy remains unchanged. Emoji continue to use the system color-emoji stack.

### Signature

The daily verse becomes a responsive “오늘의 말씀 책갈피.” The calendar retains the full 92–126px verse card. Growth, story, request, and settings use a compact 68px mobile / 84px desktop version with the label, one-line verse, and reference. This is the single distinctive gesture; other decorative elements remain restrained.

## Layout

### Topbar refresh utility

- `#refreshButton` moves into `.topbar-account-actions` before `#accountButton`.
- It remains available on every authenticated top-level page.
- Mobile geometry matches the notification utility at 42×42px; desktop is 46×46px.
- The accessible name remains `페이지 완전 새로고침`.
- Existing deep reload, service-worker update, busy state, toast, and fallback behavior remain unchanged.
- The synchronous fallback in `config.js` uses the topbar utility host when available and falls back to `body` only before the header exists.

### Context action row

- `#addEventButton` moves from the fixed viewport layer to document flow directly after `.view-tabs`.
- It remains visible only for calendar and growth, using the existing labels `일정 추가` and `성장 기록`.
- It aligns right, has a minimum 48px touch height, and uses the existing theme gradient.
- Story, request, and settings continue to hide it through their existing view adapters.
- The body safe-zone observer continues protecting the growth AI area but only controls the contextual add button; refresh is no longer hidden because it no longer overlaps content.

### Compact verse bookmark

- When `#calendarView` is hidden, the verse card becomes a compact two-column grid.
- The redundant `매일 새로운 말씀` text is hidden only in compact mode.
- The verse stays on one line with ellipsis; the reference remains visible.
- The decorative quote is reduced, not removed.
- Full calendar mode is unchanged.

## Growth Decoration

The night-theme rule `#babyJournalContent > section::before` no longer draws the two gold lines and central cross. It uses `content: none` and `display: none`. Existing card borders and moonlit surface gradients remain unchanged.

## Motion

- Daily verse and tabs: 220ms.
- Hero card: 220ms with 20ms delay.
- Calendar card: 220ms with 40ms delay.
- Agenda and growth entries: 200ms.
- Existing `prefers-reduced-motion: reduce` handling remains authoritative.
- No new ambient animation is added.

## Copy

- `BABY JOURNAL` → `아기 성장 기록`
- `FAMILY LAB` → `가족 기능 제안`
- `ADMIN ONLY` → `관리자 전용`
- `APPEARANCE` → `화면 꾸미기`
- `ENGLISH STORY TIME` remains because English is the page subject.

## Accessibility and Responsive Requirements

- Topbar and context actions keep visible `focus-visible` styling.
- All action targets are at least 42px; primary context action is at least 48px high.
- No horizontal overflow at 390×844, 430×932, 768×1024, or 1440×900.
- Fixed controls must not cover page text, calendar dates, inputs, selects, or page-local buttons.
- Both `night` and `forest` themes must be checked.
- The browser must be returned to `night`, the request tab, and its default viewport after verification.

## Testing

- Add a source contract test covering refresh/add-button placement, compact bookmark selectors, cross-divider removal, motion durations, Korean copy, and cache versions.
- Update the two existing refresh tests whose old assertions intentionally require body-fixed controls.
- Run the focused tests, then `npm test`, `npm run check`, and `git diff --check`.
- Verify computed geometry and screenshots in the authenticated in-app browser at all four target resolutions in both themes.

## Files Expected to Change

- `refresh-button.js`
- `refresh-button.css`
- `config.js`
- `page-header-spacing.css`
- `night-theme-polish.css`
- `styles.css`
- `index.html`
- `feature-request.js`
- `settings.js`
- `test/global-design-harmony.test.js`
- `test/floating-actions-safe-zone.test.js`
- `test/refresh-button-scroll.test.js`
