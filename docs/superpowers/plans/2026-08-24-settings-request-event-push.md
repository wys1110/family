# Settings Request and Event Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move feature requests under Settings and let each family member opt in to immediate push notifications when another member adds, edits, moves, or deletes a calendar event.

**Architecture:** Keep the existing request form, Web Push subscription table, service worker, mutation observer, and `daily-briefing-push` Edge Function. Change only the navigation and device-subscription UI: Settings owns entry into the request view, and the push card writes `enabled=true|false` while always writing `briefing_enabled=false`; the existing server-side `event-change` action continues to scope recipients to the same household and exclude the actor.

**Tech Stack:** Static HTML/CSS/JavaScript modules, Vitest source-contract tests, Supabase Auth/Postgres/Edge Functions, Web Push, GitHub Pages.

## Global Constraints

- Do not add dependencies or a database migration.
- Do not expose VAPID keys, push endpoints, authentication tokens, or private identifiers.
- Do not add compatibility layers for the removed top-level request tab or morning-briefing settings UI.
- Preserve household scoping and exclude the member who made the calendar change.
- Push failures must never roll back or block a successful calendar mutation.
- On iPhone, request notification permission only from a direct user tap in the installed home-screen app.
- Preserve unrelated worktree files: `.superpowers/`, `HANDOFF.md`, and `supabase/.temp/`.

---

### Task 1: Move Feature Requests Under Settings

**Files:**
- Create: `test/feature-request-settings-navigation.test.js`
- Modify: `feature-request.js`
- Modify: `feature-request.css`
- Modify: `tab-emojis.js`
- Modify: `config.js`
- Test: `test/feature-request-layout-harmony.test.js`
- Test: `test/storybook-typography-emoji.test.js`

**Interfaces:**
- Consumes: `window.switchView(viewName)` and the dynamically created `#settingsView` from `settings.js`.
- Produces: `[data-feature-request-settings-entry]`, `[data-open-feature-request]`, and `[data-close-feature-request]`; `switchView('feature-request')` displays `#featureRequestView` while the Settings tab remains selected.

- [ ] **Step 1: Write the failing navigation contract test**

```js
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(path, "utf8");

describe("feature request settings navigation", () => {
  const featureRequest = read("feature-request.js");
  const tabEmojis = read("tab-emojis.js");

  it("does not create a top-level request tab", () => {
    expect(featureRequest).not.toContain("navigation.appendChild(tab)");
    expect(tabEmojis).not.toContain("'feature-request':");
  });

  it("installs a settings entry and a return action", () => {
    expect(featureRequest).toContain("data-feature-request-settings-entry");
    expect(featureRequest).toContain("data-open-feature-request");
    expect(featureRequest).toContain("data-close-feature-request");
    expect(featureRequest).toContain("window.switchView('settings')");
  });

  it("keeps Settings selected and normalizes the obsolete saved view", () => {
    expect(featureRequest).toContain("tab.dataset.view === 'settings'");
    expect(featureRequest).toContain("localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, 'settings')");
    expect(featureRequest).toContain("savedView === VIEW_NAME");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the old tab implementation fails**

Run: `npx vitest run test/feature-request-settings-navigation.test.js`

Expected: FAIL because the module still appends the request tab and has no Settings entry/back action.

- [ ] **Step 3: Replace the top-level tab with a Settings entry**

Implement these exact behaviors in `feature-request.js`:

```js
const installSettingsEntry = () => {
  const settingsView = document.querySelector('#settingsView');
  if (!settingsView) return false;
  if (settingsView.querySelector('[data-feature-request-settings-entry]')) return true;

  const entry = document.createElement('section');
  entry.className = 'settings-card feature-request-settings-entry';
  entry.setAttribute('data-feature-request-settings-entry', '');
  entry.innerHTML = `
    <div><span aria-hidden="true">💡</span><div><h2>기능 요청</h2><p>필요한 기능이나 개선 의견을 남겨요.</p></div></div>
    <button type="button" data-open-feature-request>열기</button>`;
  entry.querySelector('[data-open-feature-request]').addEventListener('click', () => window.switchView(VIEW_NAME));
  settingsView.appendChild(entry);
  return true;
};
```

Also:

- Delete request-tab creation and its click listener.
- Add `<button type="button" data-close-feature-request>설정으로 돌아가기</button>` to the request heading and wire it to `window.switchView('settings')`.
- When opening the request view, hide `#settingsView`, set only the Settings tab active, set `state.activeView = VIEW_NAME`, and persist `'settings'` rather than the obsolete route.
- If local storage contains `feature-request`, call `window.switchView('settings')` and overwrite the stored value with `settings`.
- Retry `installSettingsEntry()` from the module's existing install loop because `settings.js` loads later.

- [ ] **Step 4: Add compact responsive styling**

Add styles in `feature-request.css` for `.feature-request-settings-entry` with a one-row layout, `min-height: 48px` button, neutral theme tokens, and a mobile rule that keeps the label readable at `320px`. Style `[data-close-feature-request]` as a secondary control in the request heading. Change the injected navigation layout in `config.js` from a fixed five-column grid to equal auto columns so four normal tabs and the optional admin tab both fill the row:

```css
.view-tabs {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
}
```

Remove the obsolete request mapping from `tab-emojis.js` and rotate the affected module versions in `config.js` to `20260824-settings-request-v1`.

- [ ] **Step 5: Update exact-version and layout tests, then run them**

Update `test/feature-request-layout-harmony.test.js` and `test/storybook-typography-emoji.test.js` to expect `20260824-settings-request-v1`. Run:

`npx vitest run test/feature-request-settings-navigation.test.js test/feature-request-layout-harmony.test.js test/storybook-typography-emoji.test.js test/tab-interaction-fix.test.js`

Expected: all selected tests PASS.

- [ ] **Step 6: Commit the request navigation slice**

```bash
git add feature-request.js feature-request.css tab-emojis.js config.js test/feature-request-settings-navigation.test.js test/feature-request-layout-harmony.test.js test/storybook-typography-emoji.test.js
git commit -m "feat: move feature requests under settings"
```

---

### Task 2: Replace Morning Briefing UI With Family Event Push

**Files:**
- Create: `test/event-change-push-settings.test.js`
- Modify: `daily-briefing.js`
- Modify: `daily-briefing.css`
- Modify: `event-change-push.js`
- Modify: `settings.css`
- Modify: `config.js`
- Test: `test/daily-briefing.test.js`
- Test: `test/event-change-push.test.js`
- Test: `test/settings-visibility-cleanup.test.js`
- Test: `test/global-design-harmony.test.js`

**Interfaces:**
- Consumes: `navigator.serviceWorker`, `registration.pushManager`, `Notification.requestPermission()`, `window.familyAuth.getContext()`, and Edge Function action `event-change`.
- Produces: `#eventChangePushSettings`, `#eventChangePushToggle`, and subscription payload `{ pushEnabled: boolean, briefingEnabled: false, time, timezone }`.

- [ ] **Step 1: Write the failing subscription/settings contract test**

```js
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("daily-briefing.js", "utf8");
const eventPush = readFileSync("event-change-push.js", "utf8");
const settingsCss = readFileSync("settings.css", "utf8");

describe("family event push settings", () => {
  it("shows one compact device toggle", () => {
    expect(client).toContain('card.id = "eventChangePushSettings"');
    expect(client).toContain('id="eventChangePushToggle"');
    expect(client).toContain("가족 일정 변경 알림");
    expect(client).not.toContain('id="dailyBriefingTime"');
    expect(client).not.toContain("아침 일정 브리핑");
  });

  it("never enables briefing delivery", () => {
    expect(client).toContain("pushEnabled: true");
    expect(client).toContain("pushEnabled: false");
    expect(client).toMatch(/briefingEnabled:\s*false/);
  });

  it("does not hide the event push card or patch its copy later", () => {
    expect(settingsCss).not.toContain("#eventChangePushSettings");
    expect(eventPush).not.toContain("updateSettingsCopy");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the briefing UI fails it**

Run: `npx vitest run test/event-change-push-settings.test.js`

Expected: FAIL because the current card is `#dailyBriefingSettings` and still exposes briefing controls.

- [ ] **Step 3: Make subscription persistence explicitly control event push**

Change `syncSubscription` to accept both flags and forward them without inference:

```js
const syncSubscription = async (
  subscription,
  { pushEnabled, briefingEnabled = false } = {},
) => invokePushFunction({
  action: "subscribe",
  subscription: subscription.toJSON(),
  pushEnabled,
  briefingEnabled,
  time: briefing.time,
  timezone: briefing.timezone,
});
```

In the direct click path, keep the installed-iPhone check and permission request, then call `syncSubscription(subscription, { pushEnabled: true, briefingEnabled: false })`. On disable, reuse the current browser subscription and call `syncSubscription(subscription, { pushEnabled: false, briefingEnabled: false })`. Persist only the current-device connected state needed by `updateControls`; do not expose or enable morning-briefing state.

- [ ] **Step 4: Replace the card markup and remove obsolete controls**

Create only this user-facing structure in `daily-briefing.js`:

```html
<section id="eventChangePushSettings" class="settings-card event-change-push-settings">
  <div class="event-change-push-heading">
    <span aria-hidden="true">🔔</span>
    <div><h2>가족 일정 변경 알림</h2><p>다른 가족이 일정을 추가·수정·이동·삭제하면 이 기기로 알려드려요.</p></div>
  </div>
  <button id="eventChangePushToggle" type="button">알림 받기</button>
  <p id="eventChangePushStatus" role="status" aria-live="polite"></p>
  <p class="event-change-push-ios-note">iPhone은 Safari에서 홈 화면에 추가한 앱으로 열어 주세요.</p>
</section>
```

Wire the single button to enable when disconnected and disable when connected. Remove the briefing checkbox, time input, test button, related listeners, and all morning-briefing copy. Update `daily-briefing.css` to the new class and IDs, retaining a minimum 48px touch target and both theme tokens.

- [ ] **Step 5: Keep event mutation dispatch focused**

Delete `updateSettingsCopy()` and all calls to it from `event-change-push.js`. Preserve its existing mutation classifications (`insert`, `upsert`, `update`, `delete`), non-blocking dispatch, and payload containing `eventId`, `title`, `eventDate`, `changeType`, and actor-authenticated household context. Rotate `daily-briefing` and `event-change-push` module versions in `config.js` to `20260824-event-change-push-v1`.

- [ ] **Step 6: Expose the card while retaining intentionally hidden unused settings**

In `settings.css`, remove `#settingsView > #dailyBriefingSettings` from the hidden selector. Keep `data-settings-refresh-module`, `data-activity-disclosure`, and `#feedingReminderSettings` hidden. Update the source-contract tests to assert the event push card is visible and the three unused cards remain hidden.

- [ ] **Step 7: Run the push and settings tests**

Run:

`npx vitest run test/event-change-push-settings.test.js test/daily-briefing.test.js test/event-change-push.test.js test/settings-visibility-cleanup.test.js test/global-design-harmony.test.js`

Expected: all selected tests PASS, including existing actor-exclusion and household-targeting contracts.

- [ ] **Step 8: Commit the push-settings slice**

```bash
git add daily-briefing.js daily-briefing.css event-change-push.js settings.css config.js test/event-change-push-settings.test.js test/daily-briefing.test.js test/event-change-push.test.js test/settings-visibility-cleanup.test.js test/global-design-harmony.test.js
git commit -m "feat: enable family event change push"
```

---

### Task 3: Verify, Publish, and Check Production Boundaries

**Files:**
- Modify only if verification exposes a defect: files already listed in Tasks 1-2.

**Interfaces:**
- Consumes: repository test scripts, GitHub Pages workflow, public site, Supabase project `ljutcgmgtqfkwkxdbiyb`.
- Produces: pushed `main`, successful deployment evidence, rendered mobile verification, and a clear device-enrollment status.

- [ ] **Step 1: Run the full repository verification**

Run:

```bash
npm test
npm run check
git diff --check
```

Expected: commands exit 0. If `npm run check` is not defined, run the repository's actual scripts from `npm run` and record that exact substitute rather than adding a placeholder script.

- [ ] **Step 2: Inspect the final diff for privacy and scope**

Run:

```bash
git diff origin/main...HEAD --check
git diff origin/main...HEAD -- feature-request.js daily-briefing.js event-change-push.js settings.css config.js
git status --short
```

Expected: no endpoint/key/token output, no unrelated untracked files staged, no DB migration, and no calendar-save path awaiting the push request.

- [ ] **Step 3: Commit any verification-only corrections**

If Task 3 required corrections, stage only the named files and commit with `fix: finalize settings event notifications`. If no correction was required, do not create an empty commit.

- [ ] **Step 4: Push main and verify GitHub Pages**

Run:

```bash
git push origin main
gh run list --limit 5
```

Wait for the Pages workflow associated with the pushed SHA and verify it completes successfully. Confirm `git rev-parse HEAD` equals `git rev-parse origin/main`.

- [ ] **Step 5: Verify the public mobile UI**

Open `https://wys1110.github.io/family/?__refresh=settings-event-push-v1`, sign in using the existing browser session, and verify at an iPhone-sized viewport:

- the top navigation has no request tab;
- Settings contains `기능 요청` and `가족 일정 변경 알림`;
- opening and closing the request screen keeps Settings selected;
- white and dark modes contain no hidden dark-theme residue or clipped controls;
- the notification permission prompt appears only after tapping `알림 받기`.

- [ ] **Step 6: Verify live data boundaries without exposing secrets**

Confirm the Edge Function `daily-briefing-push` is ACTIVE and the `push_subscriptions` table exists with household/user scoping. Do not add a cron job: immediate `event-change` pushes do not use cron. Report the enabled-subscription count only; if it is zero, state that each receiving family member must tap `알림 받기` once on their own installed iPhone app before a two-device delivery test can pass.
