# Wallpaper Dual Image Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사진 전체를 보존하는 선명한 원본 위에 같은 사진의 흐린 확대 배경을 결합하여 일정·성장 카드를 자연스러운 월페이퍼로 채운다.

**Architecture:** 각 월페이퍼 카드에 `cover` 배경 이미지와 `contain` 원본 이미지를 별도 DOM 레이어로 둔다. `renderWallpapers()`는 동일한 서명 URL을 두 레이어에 동기화하되 실패 상태를 각각 기억하고, 원본 실패만 카드 전체의 기본 디자인 복구 조건으로 사용한다.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Vitest, Supabase Storage signed URLs, GitHub Pages

## Global Constraints

- 선명한 원본 사진은 세로·가로 비율과 전체 범위를 유지한다.
- 흐린 배경은 카드 전체를 채우되 원본보다 어둡고 채도가 낮아야 한다.
- 원본 실패 시 두 이미지 모두 숨기고 같은 URL을 반복 요청하지 않는다.
- 배경만 실패하면 선명한 원본과 카드 콘텐츠를 유지한다.
- Supabase 테이블, Storage 경로, 가족별 접근 제어와 기존 사진 데이터는 변경하지 않는다.
- 사용자 소유 미추적 파일 `.superpowers/`, `HANDOFF.md`, `supabase/.temp/`는 건드리지 않는다.

---

### Task 1: Dual Image Markup and Independent Failure State

**Files:**
- Modify: `index.html:103-118`
- Modify: `index.html:185-225`
- Modify: `app.js:512-535`
- Test: `test/household-wallpapers.test.js`

**Interfaces:**
- Consumes: `state.wallpapers[surface]` with `{ path: string, url: string } | null`
- Produces: `[data-wallpaper-backdrop]` and `[data-wallpaper-image]` elements synchronized to one URL with independent `dataset.failedSrc` markers

- [ ] **Step 1: Write failing dual-layer behavior tests**

Update the wallpaper harness so `querySelector()` returns separate `backdrop`, `image`, and remove-button objects. Add these assertions:

```js
test('renders one blurred backdrop and one full image for each wallpaper surface', () => {
  expect(html.match(/data-wallpaper-backdrop=/g)).toHaveLength(2);
  expect(html.match(/class="wallpaper-backdrop"/g)).toHaveLength(2);
  const harness = createWallpaperHarness('https://example.test/signed-url');
  harness.render();
  expect(harness.backdrop.srcAssignments).toBe(1);
  expect(harness.image.srcAssignments).toBe(1);
  expect(harness.backdrop.hidden).toBe(false);
  expect(harness.image.hidden).toBe(false);
});

test('keeps the full image when only the blurred backdrop fails', () => {
  const harness = createWallpaperHarness('https://example.test/signed-url');
  harness.render();
  harness.backdrop.onerror();
  harness.render();
  expect(harness.backdrop.srcAssignments).toBe(1);
  expect(harness.backdrop.hidden).toBe(true);
  expect(harness.image.hidden).toBe(false);
  expect(harness.node.classList.contains('has-wallpaper')).toBe(true);
});

test('hides both layers when the full image fails and retries both for a new URL', () => {
  const harness = createWallpaperHarness('https://example.test/old-url');
  harness.render();
  harness.image.onerror();
  harness.render();
  expect(harness.backdrop.hidden).toBe(true);
  expect(harness.image.hidden).toBe(true);
  expect(harness.backdrop.srcAssignments).toBe(1);
  expect(harness.image.srcAssignments).toBe(1);
  harness.state.wallpapers.calendar.url = 'https://example.test/new-url';
  harness.render();
  expect(harness.backdrop.srcAssignments).toBe(2);
  expect(harness.image.srcAssignments).toBe(2);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run test/household-wallpapers.test.js`

Expected: FAIL because backdrop elements and their independent failure state do not exist.

- [ ] **Step 3: Add backdrop markup and synchronize both image layers**

Insert this before the existing `.wallpaper-image` in both cards, using the matching surface value:

```html
<img class="wallpaper-backdrop" data-wallpaper-backdrop="calendar" alt="" hidden />
```

Use this renderer so each layer remembers its own failed URL:

```js
function renderWallpapers() {
  document.querySelectorAll("[data-wallpaper-surface]").forEach((node) => {
    const surface = node.dataset.wallpaperSurface;
    const wallpaper = state.wallpapers[surface];
    const url = wallpaper?.url || "";
    const backdrop = node.querySelector("[data-wallpaper-backdrop]");
    const image = node.querySelector("[data-wallpaper-image]");
    if (backdrop.dataset.failedSrc && backdrop.dataset.failedSrc !== url) delete backdrop.dataset.failedSrc;
    if (image.dataset.failedSrc && image.dataset.failedSrc !== url) delete image.dataset.failedSrc;
    const showImage = Boolean(url) && image.dataset.failedSrc !== url;
    const showBackdrop = showImage && backdrop.dataset.failedSrc !== url;
    node.classList.toggle("has-wallpaper", showImage);
    backdrop.hidden = !showBackdrop;
    image.hidden = !showImage;
    backdrop.onerror = showBackdrop ? () => {
      if (backdrop.getAttribute("src") !== url) return;
      backdrop.dataset.failedSrc = url;
      backdrop.hidden = true;
      backdrop.removeAttribute("src");
    } : null;
    image.onerror = showImage ? () => {
      if (image.getAttribute("src") !== url) return;
      image.dataset.failedSrc = url;
      backdrop.hidden = true;
      image.hidden = true;
      backdrop.removeAttribute("src");
      image.removeAttribute("src");
      node.classList.remove("has-wallpaper");
    } : null;
    if (showBackdrop && backdrop.getAttribute("src") !== url) backdrop.src = url;
    if (showImage && image.getAttribute("src") !== url) image.src = url;
    if (!showBackdrop) backdrop.removeAttribute("src");
    if (!showImage) image.removeAttribute("src");
    node.querySelector("[data-wallpaper-remove]").hidden = !url;
  });
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run test/household-wallpapers.test.js`

Expected: all wallpaper tests pass.

- [ ] **Step 5: Commit the dual rendering behavior**

```bash
git add index.html app.js test/household-wallpapers.test.js
git commit -m "fix: add dual family wallpaper layers"
```

### Task 2: Blurred Fill Styling and Cache Delivery

**Files:**
- Modify: `family-wallpapers.css`
- Modify: `config.js:187`
- Modify: `index.html:548-550`
- Test: `test/household-wallpapers.test.js`
- Test: `test/global-design-harmony.test.js`
- Test: `test/calendar-font-settings.test.js`
- Test: `test/calendar-mobile-polish.test.js`
- Test: `test/calendar-month-typography.test.js`
- Test: `test/demo-theme-settings.test.js`
- Test: `test/upcoming-events.test.js`

**Interfaces:**
- Consumes: `.wallpaper-backdrop`, `.wallpaper-image`, `.wallpaper-scrim`, `.has-wallpaper`
- Produces: backdrop at layer 0, sharp image at layer 1, scrim at layer 2, content at layer 3, actions at layer 4

- [ ] **Step 1: Write failing CSS and version assertions**

```js
test('fills the card with a subdued blurred copy behind the full image', () => {
  expect(css).toMatch(/\.wallpaper-backdrop\s*\{[^}]*object-fit:\s*cover;/s);
  expect(css).toMatch(/\.wallpaper-backdrop\s*\{[^}]*filter:\s*blur\(/s);
  expect(css).toMatch(/\.wallpaper-image\s*\{[^}]*object-fit:\s*contain;/s);
  expect(css).toMatch(/\.wallpaper-scrim\s*\{[^}]*z-index:\s*2;/s);
  expect(config).toContain('{ name: "family-wallpapers", version: "20260815-dual-layer-v1", script: false }');
});
```

Update exact version assertions to `config.js?v=20260815-wallpaper-dual-layer-v1`, `app.js?v=20260815-wallpaper-dual-layer-v1`, and module version `20260815-dual-layer-v1`.

- [ ] **Step 2: Run focused delivery tests and verify failure**

Run: `npx vitest run test/household-wallpapers.test.js test/global-design-harmony.test.js test/calendar-font-settings.test.js test/calendar-mobile-polish.test.js test/calendar-month-typography.test.js test/demo-theme-settings.test.js test/upcoming-events.test.js`

Expected: FAIL on missing backdrop styling and old versions.

- [ ] **Step 3: Implement deterministic five-layer styling**

Use the following layer responsibilities:

```css
.wallpaper-backdrop,
.wallpaper-image,
.wallpaper-scrim {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.wallpaper-backdrop {
  z-index: 0;
  object-fit: cover;
  transform: scale(1.08);
  filter: blur(16px) brightness(.46) saturate(.72);
}
.wallpaper-image {
  z-index: 1;
  object-fit: contain;
  object-position: right center;
}
.wallpaper-scrim { z-index: 2; }
.wallpaper-surface > :not(.wallpaper-backdrop):not(.wallpaper-image):not(.wallpaper-scrim) { z-index: 3; }
.wallpaper-actions { z-index: 4; }
```

Keep the existing calendar and growth gradients, contrast surfaces, and mascot-hiding rule.

- [ ] **Step 4: Bump public asset versions**

Set `family-wallpapers` to `20260815-dual-layer-v1`, and both `config.js` and `app.js` query versions to `20260815-wallpaper-dual-layer-v1`. Update all exact-version tests listed above.

- [ ] **Step 5: Run focused tests and verify pass**

Run: `npx vitest run test/household-wallpapers.test.js test/global-design-harmony.test.js test/calendar-font-settings.test.js test/calendar-mobile-polish.test.js test/calendar-month-typography.test.js test/demo-theme-settings.test.js test/upcoming-events.test.js`

Expected: all focused tests pass.

- [ ] **Step 6: Commit styling and delivery**

```bash
git add family-wallpapers.css config.js index.html test/household-wallpapers.test.js test/global-design-harmony.test.js test/calendar-font-settings.test.js test/calendar-mobile-polish.test.js test/calendar-month-typography.test.js test/demo-theme-settings.test.js test/upcoming-events.test.js
git commit -m "fix: fill wallpaper cards without cropping"
```

### Task 3: Full Verification and Production Delivery

**Files:**
- Verify: all tracked project files

**Interfaces:**
- Consumes: completed dual-layer implementation
- Produces: verified main commit and public GitHub Pages assets

- [ ] **Step 1: Run static checks and full tests**

Run: `npm run check && npm test`

Expected: both commands exit 0 and all tests pass.

- [ ] **Step 2: Request a read-only code review**

Review the diff from the pre-feature commit through `HEAD`, focusing on independent image failure handling, stacking order, full-image preservation, and cache delivery. Fix all Critical and Important findings with a failing regression test first.

- [ ] **Step 3: Integrate and verify main**

Fast-forward the reviewed branch into `main`, rerun `npm run check && npm test`, and preserve the known untracked user files.

- [ ] **Step 4: Push and verify GitHub Actions**

Run: `git push origin main`, then confirm the validation and Pages workflows for the pushed SHA complete successfully.

- [ ] **Step 5: Verify public assets**

```bash
curl -fsSL 'https://wys1110.github.io/family/?__appv=wallpaper-dual-layer-v1' | rg '20260815-wallpaper-dual-layer-v1'
curl -fsSL 'https://wys1110.github.io/family/config.js?v=20260815-wallpaper-dual-layer-v1' | rg '20260815-dual-layer-v1'
curl -fsSL 'https://wys1110.github.io/family/family-wallpapers.css?v=20260815-dual-layer-v1' | rg 'wallpaper-backdrop|object-fit: cover|blur\(16px\)'
```

Expected: every command prints the new version or backdrop rules and exits 0.

- [ ] **Step 6: Confirm synchronization and clean up**

Run: `git fetch origin --prune && git rev-list --left-right --count HEAD...origin/main`

Expected: `0 0`; remove only the worktree and branch created for this task.
