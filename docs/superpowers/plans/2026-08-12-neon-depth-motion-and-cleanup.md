# Neon Depth Motion and Runtime Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved C-style neon 3D motion system to all family app views and remove unreachable runtime assets without changing stored family data.

**Architecture:** A new `motion-system.js` owns direction, transition orchestration, reduced-motion policy, fallback entrance animation, and completion feedback behind `window.FAMILY_MOTION_API`. A matching `motion-system.css` owns theme-aware motion tokens and visual keyframes. Existing view modules remain unchanged: the motion module wraps the final global `switchView` chain just before each tab click and uses the active tab as its interface.

**Tech Stack:** Static HTML, vanilla JavaScript, CSS View Transitions, Web Animations API, Vitest, GitHub Pages.

## Global Constraints

- Do not add a runtime dependency.
- Keep white and dark as the only exposed themes.
- Respect `prefers-reduced-motion: reduce` and limit reduced motion to an opacity change of at most 80ms.
- Preserve family and private data scope; do not modify Supabase schema, migrations, RLS, or stored rows.
- Preserve the existing top navigation, focus order, active-view persistence, and fallback behavior.
- Delete unreachable product assets from Git; retain `supabase/migrations/20260716_private_space.sql` as applied database history.

---

### Task 1: Runtime manifest integrity and dead asset removal

**Files:**
- Create: `test/runtime-manifest-integrity.test.js`
- Modify: `config.js`
- Modify: `service-worker.js`
- Delete: `ghibli-theme.js`
- Delete: `ghibli-theme.css`
- Delete: `storybook-theme.js`
- Delete: `storybook-theme.css`
- Delete: `private-space.js`
- Delete: `private-space.css`
- Delete: `growth-date-time-alignment.css`
- Delete: `growth-dialog-simple.css`
- Delete: `growth-history-edit.js`
- Delete: `growth-history-edit.css`
- Delete: `growth-when-polish.css`

**Interfaces:**
- Consumes: `config.js` module entries shaped as `{ name, version, style?, script? }`.
- Produces: a manifest whose active JS/CSS paths exist and which contains no no-op entries or retired paths.

- [ ] **Step 1: Write the failing manifest test**

```js
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const config = readFileSync('config.js', 'utf8');
const serviceWorker = readFileSync('service-worker.js', 'utf8');
const modules = [...config.matchAll(/\{ name: "([^"]+)"([^}]*)\}/g)].map(([, name, options]) => ({
  name,
  style: !options.includes('style: false'),
  script: !options.includes('script: false'),
}));

describe('runtime manifest integrity', () => {
  test('every active manifest asset exists', () => {
    for (const module of modules) {
      if (module.style) expect(existsSync(`${module.name}.css`), `${module.name}.css`).toBe(true);
      if (module.script) expect(existsSync(`${module.name}.js`), `${module.name}.js`).toBe(true);
    }
  });

  test('contains no inactive or retired product paths', () => {
    expect(modules.every((module) => module.style || module.script)).toBe(true);
    for (const retired of ['growth-history-edit', 'storybook-theme', 'ghibli-theme', 'private-space', 'language-practice']) {
      expect(config).not.toContain(retired);
      expect(serviceWorker).not.toContain(retired);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run test/runtime-manifest-integrity.test.js`

Expected: FAIL for missing `family-permissions.css`, the no-op `growth-history-edit` entry, and stale `language-practice` service-worker paths.

- [ ] **Step 3: Make the manifest minimal and delete unreachable assets**

In `config.js`, change the permissions entry to script-only:

```js
{ name: "family-permissions", version: "20260805-family-permissions-v1", style: false },
```

Delete the no-op `growth-history-edit` entry. Remove the two `language-practice` clauses from `service-worker.js`. Delete the eleven unreachable product files listed above with `apply_patch`; do not delete development files or Supabase migrations.

- [ ] **Step 4: Run focused and theme-boundary tests**

Run: `npx vitest run test/runtime-manifest-integrity.test.js test/demo-theme-settings.test.js test/production-theme-settings.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit the cleanup**

```bash
git add config.js service-worker.js test/runtime-manifest-integrity.test.js ghibli-theme.js ghibli-theme.css storybook-theme.js storybook-theme.css private-space.js private-space.css growth-date-time-alignment.css growth-dialog-simple.css growth-history-edit.js growth-history-edit.css growth-when-polish.css
git commit -m "chore: remove unreachable runtime assets"
```

### Task 2: Motion policy and transition orchestration

**Files:**
- Create: `motion-system.js`
- Create: `test/motion-system.test.js`
- Modify: `config.js`
- Modify: `service-worker.js`

**Interfaces:**
- Consumes: the global `switchView(requestedView)` chain and `.view-tab[data-view]` active state.
- Produces: `window.FAMILY_MOTION_API` with `directionBetween(from, to)`, `transitionView(requestedView, update)`, `markSaved(target)`, and `ensureWrapped()`.

- [ ] **Step 1: Write the failing behavior test**

```js
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, test, vi } from 'vitest';

const source = readFileSync('motion-system.js', 'utf8');

function loadMotion({ reduce = false, startViewTransition } = {}) {
  const listeners = new Map();
  const document = {
    documentElement: { dataset: {} },
    readyState: 'loading',
    addEventListener: (name, callback) => listeners.set(name, callback),
    querySelector: () => null,
    querySelectorAll: () => [],
    startViewTransition,
  };
  const window = {
    document,
    matchMedia: () => ({ matches: reduce }),
    setTimeout: (callback) => callback(),
    clearTimeout: () => {},
  };
  vm.runInNewContext(source, { window, document, console, CustomEvent: class {} });
  return window.FAMILY_MOTION_API;
}

describe('neon depth motion policy', () => {
  test('uses navigation order to choose motion direction', () => {
    const api = loadMotion();
    expect(api.directionBetween('calendar', 'growth')).toBe('forward');
    expect(api.directionBetween('settings', 'english')).toBe('backward');
    expect(api.directionBetween('growth', 'growth')).toBe('none');
  });

  test('uses View Transition when motion is allowed', () => {
    const update = vi.fn();
    const startViewTransition = vi.fn((callback) => { callback(); return { finished: Promise.resolve() }; });
    loadMotion({ startViewTransition }).transitionView('growth', update, { currentView: 'calendar' });
    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  test('updates immediately when reduced motion is requested', () => {
    const update = vi.fn();
    const startViewTransition = vi.fn();
    loadMotion({ reduce: true, startViewTransition }).transitionView('growth', update, { currentView: 'calendar' });
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the motion test and verify RED**

Run: `npx vitest run test/motion-system.test.js`

Expected: FAIL because `motion-system.js` does not exist.

- [ ] **Step 3: Implement the motion module**

Create `motion-system.js` as an IIFE. Use this public behavior:

```js
const VIEW_ORDER = ['calendar', 'growth', 'english', 'feature-request', 'settings', 'admin'];
const directionBetween = (from, to) => {
  if (!from || !to || from === to) return 'none';
  return VIEW_ORDER.indexOf(to) >= VIEW_ORDER.indexOf(from) ? 'forward' : 'backward';
};
```

`transitionView()` must set `document.documentElement.dataset.familyMotionDirection`, call `document.startViewTransition(update)` only when supported and motion is not reduced, call `update()` directly otherwise, and clear the direction after `finished`. `ensureWrapped()` must wrap the latest `window.switchView`, avoid double wrapping, and be called in the capture phase for `.view-tab[data-view]` clicks so modules installed later cannot bypass it. `markSaved()` adds and then removes `family-motion-saved` on the supplied target.

Add the module to `config.js`:

```js
{ name: "motion-system", version: "20260812-neon-depth-v1" },
```

Add `motion-system.js` and `motion-system.css` to the service worker network-fresh list.

- [ ] **Step 4: Run the motion and manifest tests**

Run: `npx vitest run test/motion-system.test.js test/runtime-manifest-integrity.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit orchestration**

```bash
git add motion-system.js config.js service-worker.js test/motion-system.test.js test/runtime-manifest-integrity.test.js
git commit -m "feat: add neon depth motion orchestration"
```

### Task 3: Theme-aware neon 3D visual system

**Files:**
- Create: `motion-system.css`
- Modify: `app.js`
- Modify: `test/motion-system.test.js`

**Interfaces:**
- Consumes: `data-family-motion-direction`, View Transition pseudo-elements, open `<dialog>` elements, `#growthCompleteDialog`, and `#addEventButton`.
- Produces: forward/backward 3D transitions, card entrance choreography, sheet rise, save glow, FAB response, white/dark tokens, and reduced-motion overrides.

- [ ] **Step 1: Extend the test with visual contracts**

```js
const css = readFileSync('motion-system.css', 'utf8');
const app = readFileSync('app.js', 'utf8');

test('defines themed neon depth visuals and reduced motion', () => {
  expect(css).toContain('--motion-neon-violet: #8d7bff');
  expect(css).toContain('::view-transition-old(family-view-stage)');
  expect(css).toContain('::view-transition-new(family-view-stage)');
  expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  expect(css).toMatch(/animation-duration:\s*\.08s/);
});

test('marks growth completion for save feedback', () => {
  expect(app).toContain('window.FAMILY_MOTION_API?.markSaved(dialog)');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run test/motion-system.test.js`

Expected: FAIL because the stylesheet and save-feedback hook are absent.

- [ ] **Step 3: Implement the signature visual system**

Create CSS tokens for white and dark themes. Apply `view-transition-name: family-view-stage` only to the visible top-level view. Define 420ms forward/backward keyframes with perspective, rotateY, translateX, translateZ, opacity, blur, and a single cyan-violet-pink light trail. Add a short stagger to direct cards in `.family-motion-entering`, 3D rise for `.sheet-dialog[open]`, glow for `.family-motion-saved`, and a one-time FAB entrance. Keep the top navigation stable.

Add the completion hook in `showGrowthComplete()` after `showModal()`:

```js
window.FAMILY_MOTION_API?.markSaved(dialog);
```

The reduced-motion block must disable 3D transforms and use at most `.08s` opacity transitions.

- [ ] **Step 4: Run focused design tests and static checks**

Run: `npx vitest run test/motion-system.test.js test/global-design-harmony.test.js test/view-tab-touch-focus.test.js`

Run: `node --check motion-system.js && node --check app.js && git diff --check`

Expected: all commands PASS.

- [ ] **Step 5: Commit visuals**

```bash
git add motion-system.css app.js test/motion-system.test.js
git commit -m "feat: style neon depth app transitions"
```

### Task 4: Full verification and mobile visual proof

**Files:**
- Modify only if verification finds a scoped regression.

**Interfaces:**
- Consumes: the complete application and built-in demo mode.
- Produces: verified behavior in white/dark, modern/fallback/reduced motion, and a deployable Git state.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`

Expected: all test files and tests PASS.

- [ ] **Step 2: Run the repository check**

Run: `npm run check`

Expected: theme guard, JavaScript syntax, and TypeScript checks PASS.

- [ ] **Step 3: Run repository integrity checks**

Run: `git diff --check && git status --short --branch`

Expected: no whitespace errors and only planned files differ from the branch base.

- [ ] **Step 4: Verify the mobile demo visually**

Serve the worktree locally, open `?demo=1&__refresh=neon-depth-v1`, and verify at an iPhone-sized viewport:

- calendar → growth moves forward with neon 3D depth;
- settings → calendar moves backward;
- tabs and fixed actions stay stationary and usable;
- sheet dialogs rise without clipping;
- growth completion glows once;
- white and dark text remain readable;
- reduced motion removes 3D movement.

- [ ] **Step 5: Request code review and address only confirmed issues**

Review the diff for requirement coverage, runtime manifest integrity, reduced-motion handling, and accidental data/schema changes. Re-run the focused and full commands after any correction.

### Task 5: Integrate and deploy

**Files:**
- No new product files beyond Tasks 1–4.

**Interfaces:**
- Consumes: verified feature branch commits.
- Produces: `main`, GitHub validation, GitHub Pages deployment, and public URL proof.

- [ ] **Step 1: Merge the verified branch into `main` without including root untracked files**

Run the normal fast-forward or merge flow after confirming the root checkout still only contains the user-owned `.superpowers/`, `HANDOFF.md`, and `supabase/.temp/` paths.

- [ ] **Step 2: Push `main`**

Run: `git push origin main`

Expected: the remote accepts the new main commit.

- [ ] **Step 3: Watch validation and Pages deployment**

Run `gh run list --repo wys1110/family --limit 10` and watch the matching validation and Pages runs until both complete successfully.

- [ ] **Step 4: Verify public assets**

Check `https://wys1110.github.io/family/` returns HTTP 200, public `config.js` contains `motion-system`, and `motion-system.js` plus `motion-system.css` return HTTP 200.

- [ ] **Step 5: Report outcome**

Report the commit, test totals, deleted file/line totals, deployment status, and public link. Do not claim authenticated family-data behavior unless directly verified with an authenticated session.
