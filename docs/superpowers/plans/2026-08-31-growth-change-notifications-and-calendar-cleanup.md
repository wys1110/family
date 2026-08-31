# Growth Change Notifications and Calendar Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing family-change push notification flow to growth diary changes, and remove the obsolete “오늘 한눈에 보기” and “패밀리 핸드오프” cards from 일정 without weakening household privacy or the existing notification flow.

**Architecture:** Reuse the existing `event-change-push.js` mutation interception, `daily-briefing-push` Edge Function, `notifications` history table, service worker, and notification center. Growth mutations will use `source_type = 'growth'` and `kind = 'growth_change'`, with one notification and push per other household member. Notification-center deep links will open the growth view and target the changed entry. The calendar cleanup will delete the two module files and their manifest references while preserving `family-utility` search APIs.

**Tech Stack:** Vanilla browser modules, Vitest static contract tests, Supabase Postgres migrations, Supabase Edge Functions (Deno TypeScript), Web Push.

## Global Constraints

- Preserve existing event-change notifications, daily briefing notifications, service-worker click handling, and household-member/RLS boundaries.
- Do not include growth notes or photo paths in notification titles, bodies, or push payloads.
- Do not add a second push setting; the existing family-change setting will be relabeled to cover family records.
- Remove obsolete calendar modules rather than keeping compatibility shims or dead exports.
- Preserve unrelated user files and worktree changes.
- Follow test-first order: add a focused failing contract test, run it to observe failure, then implement the smallest change that makes it pass.

---

## Task 1: Extend notification schema for growth changes

**Files:**
- Create `supabase/migrations/20260831_growth_change_notifications.sql` using `supabase migration new growth_change_notifications` (use the generated migration filename if the CLI adds a timestamp).
- Modify `supabase/schema.sql`.
- Create `test/growth-change-notifications.test.js`.

- [ ] Add failing schema-contract tests that require `growth_change` in the notifications `kind` check and `growth` in the `source_type` check, in both the migration and canonical schema.
- [ ] Run `npx vitest run test/growth-change-notifications.test.js`; confirm it fails before production changes.
- [ ] Inspect the live notification check-constraint names with a read-only `pg_constraint` query, then write the migration to drop/recreate only the two notification checks with the new allowed values.
- [ ] Update `supabase/schema.sql` to match the live migration definition exactly.
- [ ] Run the focused test and verify it passes.

## Task 2: Capture growth diary mutations in the existing client push bridge

**Files:**
- Modify `event-change-push.js`.
- Modify `test/event-change-push.test.js`.

- [ ] Add failing assertions for `growth_entries` mutation interception, `action: "growth-change"`, add/update/delete normalization, actor exclusion context, `sourceId`, `sourceDate`, and category/value fields.
- [ ] Run `npx vitest run test/event-change-push.test.js`; confirm the new assertions fail.
- [ ] Keep the existing `events` path unchanged and add the smallest parallel growth path to the same `from(...).insert/upsert/update/delete` interception.
- [ ] Normalize growth rows to a safe notification shape containing only `id`, `title`, `date`, `time`, `category`, and core category values: height, weight, head circumference, feeding amount/type, sleep minutes, temperature, diaper kind, or health/first-moment title as applicable.
- [ ] Ensure update and delete operations retain the pre-mutation row when the Supabase response does not return the deleted/updated row.
- [ ] Emit one debounced Edge Function request per successful growth mutation with `householdId`, `action: "growth-change"`, and the normalized change.
- [ ] Add `growthDate` URL handling to the existing notification-click URL path so a push click switches to 성장 and can target the relevant date/entry.
- [ ] Run the focused client test and verify both event and growth assertions pass.

## Task 3: Generate and fan out growth-change notifications in the Edge Function

**Files:**
- Modify `supabase/functions/daily-briefing-push/index.ts`.
- Extend `test/growth-change-notifications.test.js`.

- [ ] Add failing Edge Function contract assertions for the `growth-change` branch, strict input normalization, recipient exclusion, `source_type = "growth"`, `kind = "growth_change"`, dedupe keys, and the growth deep-link URL.
- [ ] Run the focused test and confirm failure.
- [ ] Add a `growth-change` request branch that authenticates the caller using the existing user client, checks push configuration, loads household members other than the actor, upserts one notification per recipient, and sends to enabled subscriptions for those recipients.
- [ ] Reuse the existing notification insert and push-send helpers; do not create a second subscription or delivery pipeline.
- [ ] Implement strict growth-change normalization for `created`, `updated`, and `deleted` changes. Reject malformed dates/IDs and truncate user-controlled display text to the existing safe limits.
- [ ] Build Korean notification copy from category and core values, with no note/photo content, and set the URL to `./?growthDate=YYYY-MM-DD&growthId=...` when an ID is available.
- [ ] Use a stable dedupe key containing recipient, growth change kind, source ID, date, and operation so retries do not duplicate history or push delivery.
- [ ] Run the focused test and verify it passes.

## Task 4: Open growth notifications in the app and update the existing setting copy

**Files:**
- Modify `notification-center.js`.
- Modify `daily-briefing.js`.
- Modify `test/notification-center.test.js`.
- Modify `test/daily-briefing.test.js`.

- [ ] Add failing assertions for `source_type = "growth"` mapping, “성장 기록 열기”, growth source opening, and the family-change setting copy covering family records.
- [ ] Run the two focused tests and confirm failure.
- [ ] Map growth notifications to a dedicated notification-center kind and action label.
- [ ] Add a growth source action that switches to 성장, finds `.growth-entry[data-id]` when `sourceId` exists, and falls back to the notification date/list when it does not.
- [ ] Keep the existing event, todo, feeding, and briefing source actions working.
- [ ] Relabel the current event-change push setting status, heading/help text, and toasts to “가족 기록 변경 알림” (or equivalent Korean wording that clearly includes 일정·성장·수유·기저귀), without changing its storage key or permission behavior.
- [ ] Run both focused tests and verify they pass.

## Task 5: Remove the obsolete calendar modules

**Files:**
- Modify `config.js`.
- Delete `today-overview.js`.
- Delete `today-overview.css`.
- Delete `family-handoff.js`.
- Delete `family-handoff.css`.
- Modify `family-utility.js`.
- Modify `test/private-family-todos.test.js`.
- Modify `test/family-utility.test.js`.
- Delete `test/today-overview.test.js`.
- Delete `test/family-handoff.test.js`.
- Create `test/calendar-module-removal.test.js`.

- [ ] Add the removal contract test first, asserting the manifest has neither module, the four obsolete files are absent, and `family-utility` still exports `searchRecords`/`FAMILY_UTILITY_API`.
- [ ] Run `npx vitest run test/calendar-module-removal.test.js`; confirm it fails before deletion.
- [ ] Remove only the two manifest entries and the four obsolete module/style files.
- [ ] Remove the now-unused `numeric`/`todaySummary` implementation from `family-utility.js`; retain the search API used by family search.
- [ ] Remove stale handoff assertions from `test/private-family-todos.test.js`, remove obsolete module tests, and retain todo/privacy/notification coverage.
- [ ] Run the focused cleanup tests and verify they pass.

## Task 6: Apply, deploy, and verify end to end

**Files/commands:**
- `supabase/migrations/20260831_growth_change_notifications.sql` (generated migration filename if different).
- `supabase/functions/daily-briefing-push/index.ts`.
- `npm test`.
- `npm run check`.

- [ ] Run `git diff --check` and inspect the complete diff for accidental changes to private data, existing auth logic, or unrelated modules.
- [ ] Run `npm test` and `npm run check`; record the actual passing test/check output.
- [ ] Apply the reviewed migration to the linked Supabase project and verify the notification check constraints and RLS grants remain correct with read-only SQL.
- [ ] Deploy the updated `daily-briefing-push` function while preserving its current custom-auth/cron behavior, then inspect function/API logs for errors.
- [ ] Verify the public app still loads, the 일정 tab no longer renders either removed card, and the existing push setting text reflects family records.
- [ ] Exercise add/update/delete for at least one growth category through the authenticated app; verify the other household member receives one history row and one push, while the actor receives neither.
- [ ] Verify notification-center and push-click deep links open the growth entry/date.
- [ ] Commit the implementation and push `main`; report the commit, remote sync, test evidence, deployment/log evidence, and any device-side verification that still requires the user.

## Review Checklist

- [ ] No references remain to `today-overview` or `family-handoff` outside historical design/plan documents.
- [ ] No growth notification payload contains `note` or `photo_paths`.
- [ ] Existing event notifications and setting persistence remain intact.
- [ ] Growth notifications are household-scoped and actor-excluded at both client request and server fan-out.
- [ ] Migration and canonical schema agree.
- [ ] Tests fail before each implementation slice and pass afterward.
