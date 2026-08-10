# Family Wallpapers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Let each family set a shared photo wallpaper for the calendar and growth hero cards.

**Architecture:** Store one Storage object path per `household_id` and `surface` in `household_wallpapers`. The browser loads signed URLs after family data, uploads an optimized image to the existing private `growth-photos` bucket, then upserts the metadata row. The two existing hero cards render an optional CSS background plus a legibility scrim.

**Tech Stack:** Static HTML/CSS/JavaScript, Supabase Postgres, Supabase Storage, Vitest.

## Global Constraints

- The wallpaper is shared only within its household; never use another household's path or metadata.
- Reuse the private `growth-photos` bucket and its household-folder RLS model.
- Keep a local-storage fallback for demo/offline mode, scoped through `storageKey`.
- Allow JPEG, PNG, WebP, HEIC, HEIF up to 10 MB; compress browser-supported raster images before upload.
- Preserve the existing illustration when a wallpaper is missing or removed.

---

### Task 1: Persist household wallpaper metadata safely

**Files:**
- Create: `supabase/migrations/20260810_household_wallpapers.sql`
- Modify: `supabase/schema.sql`
- Test: `test/household-wallpapers.test.js`

- [ ] Add a `household_wallpapers` table keyed by `(household_id, surface)` with `surface in ('calendar', 'growth')`, a private Storage `photo_path`, creator and timestamps.
- [ ] Enable RLS. Members may read; only household owners may insert, update, or delete. All policies must combine `to authenticated` with the household predicate.
- [ ] Add a source test proving the composite unique key and owner-only mutation policies exist.

### Task 2: Load and mutate wallpaper state

**Files:**
- Modify: `app.js`
- Test: `test/household-wallpapers.test.js`

- [ ] Add `state.wallpapers` keyed by `calendar` and `growth`.
- [ ] Include `household_wallpapers` in `loadRemoteData`, validate its `household_id`, and obtain signed URLs only for paths in the active household folder.
- [ ] Add one photo input and shared upload/remove helpers. For a remote family, upload to `${householdId}/wallpapers/${surface}/...`, upsert the metadata row, and delete the replaced path only after metadata succeeds. For local/demo mode use a scoped data URL.
- [ ] Reject unsupported/oversized files and show a user-facing toast. On failure, remove only the newly uploaded object and retain the current wallpaper.
- [ ] Add tests for household-scoped Storage paths, allowed surfaces, and local fallback behavior.

### Task 3: Add mobile wallpaper controls and visual treatment

**Files:**
- Modify: `index.html`, `style.css`, `theme-system.css`, `app.js`
- Test: `test/household-wallpapers.test.js`, `test/monochrome-theme.test.js`

- [ ] Put a compact `사진 변경` control in each existing hero surface; show `사진 삭제` only when that surface has a photo.
- [ ] Render each image with `object-fit: cover`, central focal point, and a theme-sensitive overlay that keeps all hero text and controls legible.
- [ ] Retain current mascot illustration as the empty-state composition. Respect mobile safe areas and avoid moving calendar/growth action buttons.
- [ ] Test the required hooks, storage field usage, and black-theme overlay selectors.

### Task 4: Verify and deliver

**Files:**
- Modify: `README.md`

- [ ] Apply the migration only after checking for invalid existing wallpaper rows.
- [ ] Run focused tests, the full test suite, `npm run check`, and `git diff --check`.
- [ ] Verify the applied table, RLS state, and Storage-object access policy through Supabase.
- [ ] Commit only wallpaper source, tests, migration, and documentation; push `main` and verify the Pages deployment.
