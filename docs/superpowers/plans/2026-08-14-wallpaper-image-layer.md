# Wallpaper Image Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일정·성장 카드의 가족 사진을 실제 이미지 레이어로 렌더링하여 모바일에서 원본 비율과 전체 화면 범위를 유지한다.

**Architecture:** 각 월페이퍼 카드에 장식용 이미지와 스크림 요소를 추가하고 `renderWallpapers()`가 이미지 `src`와 표시 상태만 관리한다. CSS는 이미지, 스크림, 콘텐츠를 명시적인 적층 순서로 분리하며 기존 Supabase 저장·서명 URL·가족별 경로 검증은 유지한다.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Vitest, Supabase Storage signed URLs, GitHub Pages

## Global Constraints

- 세로·가로 사진 모두 원본 비율을 유지하며 카드 안에 전체가 표시되어야 한다.
- 월페이퍼가 있을 때 일정 카드의 기본 가족 캐릭터를 숨긴다.
- 이미지 로드 실패 시 깨진 이미지 아이콘 없이 기본 카드로 복구한다.
- Supabase 테이블, RLS, Storage 경로 및 기존 가족 데이터는 변경하지 않는다.
- 관련 없는 사용자 파일 `.superpowers/`, `HANDOFF.md`, `supabase/.temp/`는 건드리지 않는다.

---

### Task 1: Explicit Wallpaper Markup and Rendering

**Files:**
- Modify: `index.html:103-116`
- Modify: `index.html:185-223`
- Modify: `app.js:512-519`
- Test: `test/household-wallpapers.test.js`

**Interfaces:**
- Consumes: `state.wallpapers[surface]` with `{ path: string, url: string } | null`
- Produces: `[data-wallpaper-image]` elements whose `src`, `hidden`, and error state are managed by `renderWallpapers()`

- [ ] **Step 1: Write the failing markup and rendering tests**

```js
test('renders each wallpaper through an explicit decorative image layer', () => {
  expect(html.match(/data-wallpaper-image=/g)).toHaveLength(2);
  expect(html.match(/class="wallpaper-image"/g)).toHaveLength(2);
  expect(html.match(/class="wallpaper-scrim"/g)).toHaveLength(2);
  expect(app).toContain('const image = node.querySelector("[data-wallpaper-image]")');
  expect(app).toContain('image.src = url');
  expect(app).toContain('image.hidden = !url');
  expect(app).not.toContain('node.style.setProperty("--wallpaper-image"');
});

test('falls back to the default card when a wallpaper image fails', () => {
  expect(app).toContain('image.onerror = () =>');
  expect(app).toContain('node.classList.remove("has-wallpaper")');
  expect(app).toContain('image.hidden = true');
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run test/household-wallpapers.test.js`

Expected: FAIL because the explicit image and scrim elements and image-based renderer do not exist.

- [ ] **Step 3: Add the image layers and minimal renderer**

Add this as the first content in each `[data-wallpaper-surface]` card, with the matching surface value:

```html
<img class="wallpaper-image" data-wallpaper-image="calendar" alt="" hidden />
<span class="wallpaper-scrim" aria-hidden="true"></span>
```

Use this renderer so each card owns its image state and falls back without a broken-image icon:

```js
function renderWallpapers() {
  document.querySelectorAll("[data-wallpaper-surface]").forEach((node) => {
    const surface = node.dataset.wallpaperSurface;
    const wallpaper = state.wallpapers[surface];
    const url = wallpaper?.url || "";
    const image = node.querySelector("[data-wallpaper-image]");
    node.classList.toggle("has-wallpaper", Boolean(url));
    image.hidden = !url;
    image.onerror = url ? () => {
      if (image.getAttribute("src") !== url) return;
      image.hidden = true;
      node.classList.remove("has-wallpaper");
    } : null;
    if (url && image.getAttribute("src") !== url) image.src = url;
    if (!url) image.removeAttribute("src");
    node.querySelector("[data-wallpaper-remove]").hidden = !url;
  });
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run test/household-wallpapers.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the rendering change**

```bash
git add index.html app.js test/household-wallpapers.test.js
git commit -m "fix: render wallpapers as image layers"
```

### Task 2: Reliable Layering and Full-Image Mobile Fit

**Files:**
- Modify: `family-wallpapers.css`
- Modify: `config.js:187`
- Modify: `index.html:544-546`
- Test: `test/household-wallpapers.test.js`
- Test: `test/global-design-harmony.test.js`
- Test: `test/calendar-font-settings.test.js`
- Test: `test/calendar-mobile-polish.test.js`
- Test: `test/calendar-month-typography.test.js`
- Test: `test/demo-theme-settings.test.js`
- Test: `test/upcoming-events.test.js`

**Interfaces:**
- Consumes: `.wallpaper-image`, `.wallpaper-scrim`, `.has-wallpaper`, and existing card content
- Produces: deterministic stacking where image is layer 0, scrim is layer 1, card content/actions are layer 2+, and the default mascot is hidden only when a wallpaper exists

- [ ] **Step 1: Replace the obsolete background assertions with failing layer assertions**

```js
test('shows the full calendar and growth wallpaper without cropping or mascot overlap', () => {
  expect(css).toMatch(/\.wallpaper-image\s*\{[^}]*object-fit:\s*contain;/s);
  expect(css).toMatch(/\.wallpaper-image\s*\{[^}]*object-position:\s*right center;/s);
  expect(css).toContain('.wallpaper-surface.has-wallpaper .family-mascot { display: none; }');
  expect(css).not.toContain('var(--wallpaper-image)');
  expect(config).toContain('{ name: "family-wallpapers", version: "20260814-image-layer-v1", script: false }');
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run test/household-wallpapers.test.js test/global-design-harmony.test.js test/upcoming-events.test.js`

Expected: FAIL on the old CSS background rules and old asset versions.

- [ ] **Step 3: Implement explicit image, scrim, and content layers**

Replace the background-image implementation with these layer primitives. Existing growth text, D-day, button, and summary contrast declarations stay below them:

```css
.wallpaper-surface {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}
.wallpaper-image,
.wallpaper-scrim {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.wallpaper-image {
  z-index: 0;
  object-fit: contain;
  object-position: right center;
}
.wallpaper-scrim {
  z-index: 1;
  background: linear-gradient(105deg, var(--theme-wallpaper-scrim-start) 0%, var(--theme-wallpaper-scrim-middle) 52%, var(--theme-wallpaper-scrim-end) 100%);
}
.baby-profile-card[data-wallpaper-surface="growth"] .wallpaper-scrim {
  background: linear-gradient(90deg, var(--theme-wallpaper-scrim-start) 0%, var(--theme-wallpaper-scrim-middle) 45%, var(--theme-wallpaper-scrim-end) 72%, transparent 100%);
}
.wallpaper-surface > :not(.wallpaper-image):not(.wallpaper-scrim) { z-index: 2; }
.wallpaper-surface.has-wallpaper .family-mascot { display: none; }
.wallpaper-actions { z-index: 3; }
```

Remove all `var(--wallpaper-image)` background rules. Preserve the existing growth text, D-day, button, and summary contrast rules.

- [ ] **Step 4: Bump static asset versions consistently**

Set the config module version to `20260814-image-layer-v1`, the `config.js` query version to `20260814-wallpaper-image-layer-v1`, and the `app.js` query version to `20260814-wallpaper-image-layer-v1`. Update exact-version assertions in the listed tests.

- [ ] **Step 5: Run focused tests and verify pass**

Run: `npx vitest run test/household-wallpapers.test.js test/global-design-harmony.test.js test/calendar-font-settings.test.js test/calendar-mobile-polish.test.js test/calendar-month-typography.test.js test/demo-theme-settings.test.js test/upcoming-events.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the layering and delivery change**

```bash
git add family-wallpapers.css config.js index.html test/household-wallpapers.test.js test/global-design-harmony.test.js test/calendar-font-settings.test.js test/calendar-mobile-polish.test.js test/calendar-month-typography.test.js test/demo-theme-settings.test.js test/upcoming-events.test.js
git commit -m "fix: keep family wallpapers fully visible"
```

### Task 3: Full Verification and Production Delivery

**Files:**
- Verify: all tracked project files

**Interfaces:**
- Consumes: completed explicit image-layer implementation
- Produces: verified `main` commit pushed to `origin/main` and public GitHub Pages assets returning the new versions

- [ ] **Step 1: Run static checks**

Run: `npm run check`

Expected: exit code 0.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Inspect the final diff and repository state**

Run: `git diff --check && git status --short && git log -3 --oneline`

Expected: no whitespace errors; only the known untracked user files remain; implementation commits are at `HEAD`.

- [ ] **Step 4: Push production main**

Run: `git push origin main`

Expected: `origin/main` advances to the implementation commit.

- [ ] **Step 5: Verify public assets**

Run: `curl -fsSL https://wys1110.github.io/family/ | rg '20260814-wallpaper-image-layer-v1' && curl -fsSL 'https://wys1110.github.io/family/config.js?v=20260814-wallpaper-image-layer-v1' | rg '20260814-image-layer-v1' && curl -fsSL 'https://wys1110.github.io/family/family-wallpapers.css?v=20260814-image-layer-v1' | rg 'object-fit: contain|has-wallpaper \.family-mascot'`

Expected: all three commands print the new version or CSS rules and exit code 0.

- [ ] **Step 6: Confirm local and remote synchronization**

Run: `git fetch origin --prune && git rev-list --left-right --count HEAD...origin/main`

Expected: `0 0`.
