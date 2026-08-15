# Family Wallpaper Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일정·성장 카드를 한 장의 선명한 사진으로 채우고 사용자가 휴대폰 배경화면처럼 위치와 확대 비율을 직접 조절해 가족별로 저장하게 한다.

**Architecture:** 공용 `wallpaper-editor.js`가 편집 수학과 다이얼로그 제어를 소유하고, `app.js`는 현재 가족·surface의 사진 업로드와 편집값 영속화만 담당한다. 카드는 단일 `cover` 이미지에 저장된 `positionX`, `positionY`, `zoom`을 적용하며, Supabase 행과 테스트 모드 로컬 객체는 같은 편집 모델을 사용한다.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, native `<dialog>`, Pointer Events, Vitest, Supabase Postgres/Storage, GitHub Pages

## Global Constraints

- 세로·가로 사진 모두 카드 전체를 빈틈없이 채우고 좁은 띠나 블러 복제본이 보이지 않는다.
- 일정·성장별 위치와 확대값은 분리 저장하며 다른 가족 데이터와 절대 혼용하지 않는다.
- 편집 범위는 `positionX: 0..100`, `positionY: 0..100`, `zoom: 1..3`이고 기본값은 `50`, `50`, `1`이다.
- 새 사진은 적용 전에는 Storage나 DB에 기록하지 않고, 취소 시 기존 상태를 그대로 보존한다.
- 기존 이중 이미지 DOM·렌더러·CSS·테스트는 제거하고 호환 레이어를 추가하지 않는다.
- 기존 RLS, 가족별 Storage 경로, 사진 형식 제한, 10MB 제한을 유지한다.
- 사용자 소유 미추적 파일 `.superpowers/`, `HANDOFF.md`, `supabase/.temp/`는 건드리지 않는다.

---

### Task 1: Editor Core, Dialog, and Touch Controls

**Files:**
- Create: `wallpaper-editor.js`
- Create: `wallpaper-editor.css`
- Create: `test/wallpaper-editor.test.js`
- Modify: `index.html` near `#wallpaperPhotoInput`
- Modify: `config.js` module manifest

**Interfaces:**
- Produces: `window.FAMILY_WALLPAPER_EDITOR`
- Produces: `normalizeCrop(value) -> { positionX, positionY, zoom }`
- Produces: `cropStyle(value) -> { objectPosition, transform, transformOrigin }`
- Produces: `dragCrop(value, dx, dy, width, height) -> crop`
- Produces: `pinchZoom(startZoom, startDistance, currentDistance) -> number`
- Produces: `createController({ dialog, preview, zoomInput, zoomOutput, onSave, onChoosePhoto })`

- [ ] **Step 1: Write failing editor-core tests**

Create `test/wallpaper-editor.test.js` that evaluates `wallpaper-editor.js` with a minimal `window` object and asserts:

```js
expect(api.normalizeCrop({ positionX: -4, positionY: 140, zoom: 7 }))
  .toEqual({ positionX: 0, positionY: 100, zoom: 3 });
expect(api.normalizeCrop({ position_x: 25, position_y: 75, zoom: 1.4 }))
  .toEqual({ positionX: 25, positionY: 75, zoom: 1.4 });
expect(api.dragCrop({ positionX: 50, positionY: 50, zoom: 1 }, 40, -20, 200, 100))
  .toEqual({ positionX: 30, positionY: 70, zoom: 1 });
expect(api.pinchZoom(1.5, 100, 160)).toBe(2.4);
expect(api.cropStyle({ positionX: 30, positionY: 70, zoom: 1.5 }))
  .toEqual({ objectPosition: "30% 70%", transform: "scale(1.5)", transformOrigin: "30% 70%" });
```

Also assert the dialog contains `월페이퍼 맞추기`, `다른 사진 선택`, range input `min="1" max="3" step="0.01"`, `초기화`, `취소`, and `적용`, and that the module manifest includes `{ name: "wallpaper-editor", version: "20260815-v1" }`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run test/wallpaper-editor.test.js`

Expected: FAIL because the editor files, API, dialog, and manifest entry do not exist.

- [ ] **Step 3: Implement the pure crop API**

Implement `wallpaper-editor.js` as an IIFE with these rules:

```js
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
const normalizeCrop = (value = {}) => ({
  positionX: clamp(value.positionX ?? value.position_x ?? 50, 0, 100),
  positionY: clamp(value.positionY ?? value.position_y ?? 50, 0, 100),
  zoom: clamp(value.zoom ?? 1, 1, 3),
});
const dragCrop = (value, dx, dy, width, height) => {
  const crop = normalizeCrop(value);
  if (!(width > 0) || !(height > 0)) return crop;
  return normalizeCrop({
    positionX: crop.positionX - (dx / width) * 100 / crop.zoom,
    positionY: crop.positionY - (dy / height) * 100 / crop.zoom,
    zoom: crop.zoom,
  });
};
const pinchZoom = (startZoom, startDistance, currentDistance) =>
  clamp(startZoom * (currentDistance / Math.max(1, startDistance)), 1, 3);
const cropStyle = (value) => {
  const crop = normalizeCrop(value);
  return {
    objectPosition: `${crop.positionX}% ${crop.positionY}%`,
    transform: `scale(${crop.zoom})`,
    transformOrigin: `${crop.positionX}% ${crop.positionY}%`,
  };
};
```

Expose these functions plus the controller factory through `window.FAMILY_WALLPAPER_EDITOR`.

- [ ] **Step 4: Add the dialog and controller**

Add a native sheet dialog with IDs `wallpaperEditorDialog`, `wallpaperEditorPreview`, `wallpaperEditorZoom`, `wallpaperEditorZoomValue`, `wallpaperEditorChoose`, `wallpaperEditorReset`, `wallpaperEditorCancel`, and `wallpaperEditorApply`.

The controller must:

- keep `surface`, `url`, optional `file`, and normalized crop in draft state;
- update the preview using `cropStyle()`;
- use pointer capture and one-pointer deltas for drag;
- use the distance between two active pointers for pinch;
- synchronize the slider and visible `1.00×` output;
- revoke only object URLs it created;
- call `onSave({ surface, file, ...crop })` only from `적용`;
- leave persistent state untouched on `취소` or native dialog close;
- call `onChoosePhoto(surface)` from `다른 사진 선택`.

- [ ] **Step 5: Add focused responsive styling**

In `wallpaper-editor.css`, use `touch-action: none` on the preview, `overflow: hidden`, a calendar preview aspect ratio of `2.55 / 1`, a growth preview aspect ratio of `2.05 / 1`, 44px minimum touch targets, and theme variables already used by the app. The preview image must use `width:100%`, `height:100%`, and `object-fit:cover`.

- [ ] **Step 6: Run the focused test and commit**

Run: `npx vitest run test/wallpaper-editor.test.js`

Expected: PASS.

Commit:

```bash
git add -- wallpaper-editor.js wallpaper-editor.css index.html config.js test/wallpaper-editor.test.js
git commit -m "feat: add family wallpaper editor"
```

### Task 2: Single Cover Renderer and Local Persistence

**Files:**
- Modify: `app.js:500-590`
- Modify: `app.js:620-640`
- Modify: `index.html:103-106`
- Modify: `index.html:188-191`
- Modify: `family-wallpapers.css`
- Modify: `test/household-wallpapers.test.js`
- Test: `test/wallpaper-editor.test.js`

**Interfaces:**
- Consumes: `window.FAMILY_WALLPAPER_EDITOR.normalizeCrop`, `cropStyle`, and `createController`
- Produces: local wallpaper objects `{ path, url, positionX, positionY, zoom }`
- Produces: `applyWallpaperCrop(image, wallpaper)`
- Produces: `openWallpaperEditor(surface, file?)`
- Produces: `saveWallpaperDraft({ surface, file, positionX, positionY, zoom })`

- [ ] **Step 1: Replace dual-layer expectations with failing single-cover tests**

Update `test/household-wallpapers.test.js` to assert:

```js
expect(html).not.toContain("data-wallpaper-backdrop");
expect(html.match(/data-wallpaper-image=/g)).toHaveLength(2);
expect(css).toMatch(/\.wallpaper-image\s*\{[^}]*object-fit:\s*cover;/s);
expect(css).not.toContain(".wallpaper-backdrop");
expect(css).not.toContain("blur(16px)");
expect(app).toContain("FAMILY_WALLPAPER_EDITOR.cropStyle");
expect(app).toContain("openWallpaperEditor(change.dataset.wallpaperChange)");
```

Extend the renderer harness to verify that `{ positionX: 25, positionY: 80, zoom: 1.6 }` produces `object-position: 25% 80%`, `transform: scale(1.6)`, and `transform-origin: 25% 80%` on the card image. Retain the same-URL failure suppression and new-URL retry tests for the single image.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run test/household-wallpapers.test.js test/wallpaper-editor.test.js`

Expected: FAIL because the dual backdrop and `contain` renderer still exist and the editor is not wired to state.

- [ ] **Step 3: Remove the obsolete dual layer and render one cover image**

Remove both `[data-wallpaper-backdrop]` elements and all backdrop branches in `renderWallpapers()`. For the remaining image, compute:

```js
const crop = window.FAMILY_WALLPAPER_EDITOR.normalizeCrop(wallpaper);
const style = window.FAMILY_WALLPAPER_EDITOR.cropStyle(crop);
image.style.objectPosition = style.objectPosition;
image.style.transform = style.transform;
image.style.transformOrigin = style.transformOrigin;
```

Keep the existing failed signed-URL marker behavior on the single image. On failure hide the image, remove `has-wallpaper`, and do not retry until its URL changes.

Replace `family-wallpapers.css` with single-image layers: image `z-index:0`, scrim `z-index:1`, content `z-index:2`, actions `z-index:3`. Keep the existing calendar/growth scrims and text contrast rules.

- [ ] **Step 4: Wire editor open, file selection, and local saves**

After `FAMILY_MODULES_READY`, create one controller. Existing wallpaper opens immediately; a missing wallpaper opens the file picker first. File selection calls `prepareGrowthPhoto(file)`, creates a temporary object URL, and opens the editor without saving.

Implement local save as:

```js
const crop = window.FAMILY_WALLPAPER_EDITOR.normalizeCrop(draft);
const existing = state.wallpapers[draft.surface];
const url = draft.file ? await photoDataUrl(draft.file) : existing?.url;
state.wallpapers[draft.surface] = { path: existing?.path || "", url, ...crop };
persistLocalWallpapers();
renderWallpapers();
```

Do not call persistence when the editor is cancelled.

- [ ] **Step 5: Run focused tests and commit**

Run: `npx vitest run test/household-wallpapers.test.js test/wallpaper-editor.test.js`

Expected: PASS.

Commit:

```bash
git add -- app.js index.html family-wallpapers.css test/household-wallpapers.test.js test/wallpaper-editor.test.js
git commit -m "fix: render wallpapers like phone backgrounds"
```

### Task 3: Supabase Crop Metadata and Atomic Remote Save

**Files:**
- Create via CLI: the single new file matching `supabase/migrations/*_family_wallpaper_crop.sql`
- Modify: `supabase/schema.sql`
- Modify: `app.js:399-440`
- Modify: `app.js:548-585`
- Modify: `test/household-wallpapers.test.js`

**Interfaces:**
- Consumes: current project `ljutcgmgtqfkwkxdbiyb`
- Consumes: `household_wallpapers(household_id, surface, photo_path, created_by)`
- Produces: `position_x double precision`, `position_y double precision`, `zoom double precision`
- Produces: hydrated client objects `{ path, url, positionX, positionY, zoom }`

- [ ] **Step 1: Create the migration file through the Supabase CLI**

Run:

```bash
supabase migration new family_wallpaper_crop
```

Use the exact file path printed by the CLI. Put this SQL in that file:

```sql
alter table public.household_wallpapers
  add column position_x double precision not null default 50,
  add column position_y double precision not null default 50,
  add column zoom double precision not null default 1,
  add constraint household_wallpapers_position_x_check check (position_x between 0 and 100),
  add constraint household_wallpapers_position_y_check check (position_y between 0 and 100),
  add constraint household_wallpapers_zoom_check check (zoom between 1 and 3);
```

- [ ] **Step 2: Write failing schema and persistence tests**

Assert the migration and `schema.sql` contain the three columns and constraints. Assert hydration maps `row.position_x`, `row.position_y`, and `row.zoom` through `normalizeCrop`. Assert remote upsert sends `position_x`, `position_y`, and `zoom`, while metadata-only editing uses `.update(...)` constrained by both current `household_id` and `surface`.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npx vitest run test/household-wallpapers.test.js`

Expected: FAIL because remote metadata hydration and persistence are absent.

- [ ] **Step 4: Implement remote hydration and saving**

When hydrating a valid row, build:

```js
const crop = window.FAMILY_WALLPAPER_EDITOR.normalizeCrop(row);
return { path: row.photo_path, url: urls.get(row.photo_path) || "", ...crop };
```

For a new photo, include snake-case crop columns in the existing upsert. For an existing photo with no new file, update only the crop columns using:

```js
state.supabase.from("household_wallpapers")
  .update({ position_x: crop.positionX, position_y: crop.positionY, zoom: crop.zoom })
  .eq("household_id", state.household.id)
  .eq("surface", surface);
```

Only mutate `state.wallpapers[surface]` and close the editor after the DB operation succeeds. Preserve the existing cleanup of a newly uploaded file when its DB upsert fails.

- [ ] **Step 5: Run focused tests and commit**

Run: `npx vitest run test/household-wallpapers.test.js test/wallpaper-editor.test.js`

Expected: PASS.

Commit the exact migration path printed in Step 1 together with:

```bash
git add -- supabase/schema.sql app.js test/household-wallpapers.test.js
git commit -m "feat: persist family wallpaper framing"
```

### Task 4: Delivery Versions, Database Application, and Production Verification

**Files:**
- Modify: `config.js`
- Modify: `index.html`
- Modify: `test/household-wallpapers.test.js`
- Modify: `test/global-design-harmony.test.js`
- Modify: `test/calendar-font-settings.test.js`
- Modify: `test/calendar-mobile-polish.test.js`
- Modify: `test/calendar-month-typography.test.js`
- Modify: `test/demo-theme-settings.test.js`
- Modify: `test/upcoming-events.test.js`
- Verify: all tracked project files

**Interfaces:**
- Consumes: completed editor and committed migration
- Produces: live Supabase columns, synchronized `main`, and deployed GitHub Pages assets

- [ ] **Step 1: Add failing cache-delivery assertions**

Set expected versions to:

- `family-wallpapers@20260815-editor-v1`
- `wallpaper-editor@20260815-v1`
- `config.js?v=20260815-wallpaper-editor-v1`
- `app.js?v=20260815-wallpaper-editor-v1`

Run all tests that assert exact `config.js`, `app.js`, or `family-wallpapers` versions and confirm they fail before changing production versions.

- [ ] **Step 2: Apply versions and run full local verification**

Run:

```bash
npm run check && npm test && git diff --check
```

Expected: static checks pass and all Vitest files pass.

- [ ] **Step 3: Apply and verify the live Supabase migration**

Use Supabase project `ljutcgmgtqfkwkxdbiyb`. Apply the exact committed migration SQL once with migration name `family_wallpaper_crop`. Then query `information_schema.columns` and `pg_constraint` to verify all three columns, defaults, nullability, and range constraints. Run Supabase security and performance advisors and confirm no new finding is caused by this migration.

- [ ] **Step 4: Request final code review and fix blockers**

Review the complete branch for crop math, pointer lifecycle, object URL cleanup, cancel semantics, atomic remote saves, household/surface filters, RLS preservation, single-cover rendering, mobile stacking, and cache delivery. Fix every Critical or Important finding with a failing regression test first.

- [ ] **Step 5: Commit delivery changes**

```bash
git add -- config.js index.html test/household-wallpapers.test.js test/global-design-harmony.test.js test/calendar-font-settings.test.js test/calendar-mobile-polish.test.js test/calendar-month-typography.test.js test/demo-theme-settings.test.js test/upcoming-events.test.js
git commit -m "chore: deliver family wallpaper editor"
```

- [ ] **Step 6: Merge, push, and verify CI/Pages**

Fast-forward the reviewed branch into `main`, rerun `npm run check && npm test`, push `main`, and confirm both Validation and Pages workflows succeed for the pushed SHA.

- [ ] **Step 7: Verify public mobile behavior**

At 390×844 verify:

- no `.wallpaper-backdrop` exists;
- the card image computes to `object-fit: cover`;
- editor drag changes `object-position` preview;
- slider and pinch stay in `1..3`;
- cancel leaves persisted state unchanged;
- apply restores the same crop after reload;
- calendar and growth retain independent crop values;
- public HTML/CSS/JS expose the new asset versions.
