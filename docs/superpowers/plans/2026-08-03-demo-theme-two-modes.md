# Demo Theme Two Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `?demo=1` settings screen expose only white and dark themes while preserving the production theme catalog.

**Architecture:** `demo-mode.js` remains the source of truth for demo detection. `config.js` and `settings.js` select demo-specific theme storage keys and a two-item theme catalog when that flag is active; the storybook and ghibli extension modules return early in demo mode so they cannot append extra choices. Production mode keeps its existing catalog and behavior.

**Tech Stack:** Browser JavaScript modules, CSS data attributes, Vitest static/VM contract tests, GitHub Pages deployment.

## Global Constraints

- Demo mode is identified only by `window.FAMILY_DEMO_MODE`/`window.FAMILY_DEMO.active` set by `demo-mode.js`.
- Keep internal `white`/`black` IDs and the existing black-to-night CSS alias.
- Never read or write production theme keys from demo mode.
- Do not remove production themes in this change.
- Run the focused tests, `npm run check`, and `git diff --check` before merge.

---

### Task 1: Add failing contracts for demo-only theme selection

**Files:**
- Modify: `test/demo-mode.test.js`
- Modify: `test/monochrome-theme.test.js`
- Create: `test/demo-theme-settings.test.js`

**Interfaces:**
- Tests inspect the source contracts and execute the existing demo bootstrap in a VM where needed.
- Later tasks make `config.js`, `settings.js`, `storybook-theme.js`, and `ghibli-theme.js` satisfy these contracts.

- [ ] **Step 1: Write the failing tests**

Add assertions that demo mode owns `family-demo-theme-v1`/`family-demo-theme-choice-v1`, that settings defines a demo-only two-item catalog with `white` and `black`, and that storybook/ghibli have a demo guard. Add a production assertion that the original catalog remains present.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- --run test/demo-theme-settings.test.js test/demo-mode.test.js test/monochrome-theme.test.js
```

Expected: the new demo-theme assertions fail because the current modules still use shared storage, expose all themes in demo mode, and inject storybook/ghibli options.

- [ ] **Step 3: Commit the failing tests**

```bash
git add test/demo-theme-settings.test.js test/demo-mode.test.js test/monochrome-theme.test.js
git commit -m "test: define demo white and dark theme boundary"
```

### Task 2: Implement demo-only storage and two-theme catalog

**Files:**
- Modify: `config.js`
- Modify: `settings.js`
- Modify: `storybook-theme.js`
- Modify: `ghibli-theme.js`

**Interfaces:**
- `config.js` selects demo storage keys before applying the document theme.
- `settings.js` renders and validates only the demo catalog when `window.FAMILY_DEMO_MODE` is true.
- Extension modules return without adding UI when demo mode is active.

- [ ] **Step 1: Add demo-aware bootstrap storage in `config.js`**

Use `const demoMode = window.FAMILY_DEMO_MODE === true;` and select `family-demo-theme-v1`/`family-demo-theme-choice-v1` only for demo mode. Restrict demo bootstrap candidates to `white`/`black`, defaulting unsupported or missing values to `white`; keep the existing production candidate list unchanged.

- [ ] **Step 2: Add demo catalog selection in `settings.js`**

Keep the current production `THEMES` definitions. Add a demo catalog containing the existing white/black visual data, expose `AVAILABLE_THEMES = demoMode ? DEMO_THEMES : THEMES`, and use a demo-specific storage key pair. In demo mode label the black entry `다크` while retaining `id: 'black'` and `cssTheme: 'night'`. Ensure `storedTheme`, `validTheme`, `updateControls`, and `applyTheme` all use `AVAILABLE_THEMES`.

- [ ] **Step 3: Prevent dynamic extra options in demo mode**

At the top of `storybook-theme.js` and `ghibli-theme.js`, return when `window.FAMILY_DEMO_MODE === true` before installing their styles, listeners, or buttons.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- --run test/demo-theme-settings.test.js test/demo-mode.test.js test/monochrome-theme.test.js
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the implementation**

```bash
git add config.js settings.js storybook-theme.js ghibli-theme.js
git commit -m "feat: limit demo themes to white and dark"
```

### Task 3: Verify integration and public demo behavior

**Files:**
- Modify: `config.js` (cache version only if required by deployment)
- Modify: `test/*.test.js` (only if a focused contract exposes an actual regression)

- [ ] **Step 1: Run the complete relevant verification**

Run:

```bash
npm test -- --run test/demo-theme-settings.test.js test/demo-mode.test.js test/monochrome-theme.test.js test/theme-v2.test.js test/theme-color-guard.test.js
npm run check
git diff --check
```

Record any failures that predate this branch separately from new failures.

- [ ] **Step 2: Exercise the local demo UI**

Start a local static server, open `/?demo=1`, navigate to 설정, and verify the option IDs are exactly `['white', 'black']`; click both options and verify the document choice and color scheme.

- [ ] **Step 3: Commit any cache-version update and final verification**

If a versioned loader reference changed, update only the affected test contract, rerun the commands above, and commit with `chore: bump demo theme cache version`.
