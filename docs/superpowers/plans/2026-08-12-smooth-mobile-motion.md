# Smooth Mobile Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the heavy mobile animation stack with smooth transform-and-opacity motion.

**Architecture:** Keep the existing `switchView` wrapper and native View Transition integration, but reduce its CSS to a 220ms two-dimensional slide/fade. Remove per-card entrance orchestration and keep sheets and the FAB as isolated micro-interactions.

**Tech Stack:** Static JavaScript, CSS View Transitions, Vitest.

## Global Constraints

- Do not change themes, wallpaper behavior, data, or layout.
- Animation may use only `transform` and `opacity`; no blur, 3D rotation, perspective, or neon filters.
- Respect `prefers-reduced-motion: reduce` with an 80ms fade.

---

### Task 1: Lock the mobile motion contract

**Files:**
- Modify: `test/motion-system.test.js`

**Interfaces:**
- Consumes: `motion-system.css` and `motion-system.js` source contracts.
- Produces: Regression assertions for duration, allowed properties, and removed effects.

- [ ] **Step 1: Write the failing test**

Assert that CSS uses `.22s`, does not contain `blur(`, `rotateX`, `rotateY`, `perspective(`, `motion-neon`, `family-card-depth-arrive`, or FAB arrival animation, and that JavaScript does not add `family-motion-entering`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/motion-system.test.js`

Expected: FAIL because the existing animation contains the prohibited effects.

### Task 2: Implement smooth motion

**Files:**
- Modify: `motion-system.css`
- Modify: `motion-system.js`
- Modify: `config.js`
- Test: `test/motion-system.test.js`

**Interfaces:**
- Consumes: `window.switchView`, `document.startViewTransition`, `FAMILY_MOTION_API`.
- Produces: The same public motion API without per-card entrance classes.

- [ ] **Step 1: Replace view motion**

Use 220ms `translateX(18px)`/`translateX(-18px)` and opacity between `.82` and `1`. Use no filters or 3D transforms.

- [ ] **Step 2: Simplify sheets and FAB**

Use a 240ms `translateY(18px)` sheet rise. Remove FAB load animation; retain only `translateX(-50%) scale(.96)` on active.

- [ ] **Step 3: Remove card entrance orchestration**

Delete `animateEntrance`, its timer, and calls after view updates. Preserve direction cleanup and transition skipping.

- [ ] **Step 4: Refresh the asset version**

Change the `motion-system` asset version to `20260812-smooth-mobile-v1`.

- [ ] **Step 5: Verify focused and full checks**

Run: `npx vitest run test/motion-system.test.js`

Run: `npm test -- --run && npm run check && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add motion-system.css motion-system.js config.js test/motion-system.test.js docs/superpowers
git commit -m "fix: smooth mobile motion"
```
