import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('app.js');
const html = read('index.html');
const migration = read('supabase/migrations/20260810005856_household_wallpapers.sql');
const css = read('family-wallpapers.css');
const config = read('config.js');
const serviceWorker = read('service-worker.js');
const editorSource = read('wallpaper-editor.js');

function createWallpaperHarness(wallpaper) {
  const classes = new Set();
  const attributes = new Map();
  const image = {
    dataset: {},
    hidden: true,
    onerror: null,
    srcAssignments: 0,
    style: {},
    getAttribute(name) { return attributes.get(name) || null; },
    removeAttribute(name) { attributes.delete(name); },
    set src(value) { attributes.set('src', value); this.srcAssignments += 1; },
  };
  const removeButton = { hidden: true };
  const node = {
    dataset: { wallpaperSurface: 'calendar' },
    classList: {
      contains(name) { return classes.has(name); },
      remove(name) { classes.delete(name); },
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
    },
    querySelector(selector) {
      if (selector === '[data-wallpaper-image]') return image;
      return removeButton;
    },
  };
  const document = { querySelectorAll() { return [node]; } };
  const state = { wallpapers: { calendar: wallpaper } };
  const window = {};
  vm.runInNewContext(editorSource, { window });
  const start = app.indexOf('function applyWallpaperCrop(image, wallpaper)');
  const end = app.indexOf('async function hydrateWallpaperUrls', start);
  const createRenderer = new Function('document', 'state', 'window', `${app.slice(start, end)}\nreturn renderWallpapers;`);
  return { image, node, state, render: createRenderer(document, state, window) };
}

describe('family wallpaper', () => {
  test('keeps one shared wallpaper per household and surface', () => {
    expect(migration).toContain("surface text not null check (surface in ('calendar', 'growth'))");
    expect(migration).toContain('primary key (household_id, surface)');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('public.is_household_owner(household_id)');
  });

  test('uses household-scoped storage paths and the active household only', () => {
    expect(app).toContain("`${state.household.id}/wallpapers/${surface}/");
    expect(app).toContain('from("household_wallpapers")');
    expect(app).toContain('row.household_id === householdId');
  });

  test('provides photo change controls on both hero surfaces', () => {
    expect(html).toContain('data-wallpaper-surface="calendar"');
    expect(html).toContain('data-wallpaper-surface="growth"');
    expect(html).toContain('id="wallpaperPhotoInput"');
  });

  test('renders each wallpaper through an explicit decorative image layer', () => {
    expect(html).not.toContain('data-wallpaper-backdrop');
    expect(html.match(/data-wallpaper-image=/g)).toHaveLength(2);
    expect(html.match(/class="wallpaper-image"/g)).toHaveLength(2);
    expect(html.match(/class="wallpaper-scrim"/g)).toHaveLength(2);
    expect(app).toContain('const image = node.querySelector("[data-wallpaper-image]")');
    expect(app).toContain('image.src = url');
    expect(app).toContain('image.hidden = !showImage');
    expect(app).not.toContain('node.style.setProperty("--wallpaper-image"');
  });

  test('renders one cover image with the saved crop for each wallpaper surface', () => {
    const harness = createWallpaperHarness({
      url: 'https://example.test/signed-url',
      positionX: 25,
      positionY: 80,
      zoom: 1.6,
    });
    harness.render();
    expect(harness.image.srcAssignments).toBe(1);
    expect(harness.image.hidden).toBe(false);
    expect(harness.image.style.objectPosition).toBe('25% 80%');
    expect(harness.image.style.transform).toBe('scale(1.6)');
    expect(harness.image.style.transformOrigin).toBe('25% 80%');
  });

  test('falls back to the default card when a wallpaper image fails', () => {
    expect(app).toContain('image.onerror = showImage ? () =>');
    expect(app).toContain('node.classList.remove("has-wallpaper")');
    expect(app).toContain('image.hidden = true');
    expect(app).toMatch(/image\.onerror = showImage \? \(\) => \{[^}]+image\.hidden = true;\s+image\.removeAttribute\("src"\);/s);
  });

  test('does not retry a failed wallpaper until its signed URL changes', () => {
    const harness = createWallpaperHarness({ url: 'https://example.test/old-signed-url' });
    harness.render();
    expect(harness.image.srcAssignments).toBe(1);
    harness.image.onerror();
    expect(harness.image.hidden).toBe(true);
    expect(harness.node.classList.contains('has-wallpaper')).toBe(false);

    harness.render();
    expect(harness.image.srcAssignments).toBe(1);
    expect(harness.image.hidden).toBe(true);
    expect(harness.node.classList.contains('has-wallpaper')).toBe(false);

    harness.state.wallpapers.calendar.url = 'https://example.test/new-signed-url';
    harness.render();
    expect(harness.image.srcAssignments).toBe(2);
    expect(harness.image.hidden).toBe(false);
    expect(harness.node.classList.contains('has-wallpaper')).toBe(true);
  });

  test('keeps growth wallpaper neutral and profile text legible in white mode', () => {
    const growthSelector = '.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"]';
    expect(css).toContain(growthSelector);
    expect(css).toMatch(/\.baby-profile-card\[data-wallpaper-surface="growth"\] \.wallpaper-scrim \{[^}]+linear-gradient\(90deg,/s);
    expect(css).not.toContain('background-position: center 38%');
    expect(css).toContain(`${growthSelector}::before,`);
    expect(css).toContain(`${growthSelector}::after { content: none; }`);
    expect(css).toContain(`${growthSelector} :is(`);
    expect(css).toMatch(/\[data-wallpaper-surface="growth"\] :is\([^)]+\.baby-edit-button\s*\) \{ color: var\(--theme-wallpaper-text\) !important; \}/s);
    expect(css).toMatch(/\[data-wallpaper-surface="growth"\] \.baby-dday \{[^}]+background: var\(--theme-wallpaper-surface\) !important;/s);
  });

  test('fills calendar and growth cards with one sharp cover image', () => {
    expect(css).toMatch(/\.wallpaper-image\s*\{[^}]*object-fit:\s*cover;/s);
    expect(css).not.toContain('.wallpaper-backdrop');
    expect(css).not.toContain('blur(16px)');
    expect(css).toMatch(/\.wallpaper-image\s*\{[^}]*z-index:\s*0;/s);
    expect(css).toMatch(/\.wallpaper-scrim\s*\{[^}]*z-index:\s*1;/s);
    expect(css).toContain('.wallpaper-surface.has-wallpaper .family-mascot { display: none; }');
    expect(css).not.toContain('var(--wallpaper-image)');
    expect(config).toContain('{ name: "family-wallpapers", version: "20260815-dual-layer-v1", script: false }');
  });

  test('keeps wallpaper actions above the content layer', () => {
    expect(css).toContain('.wallpaper-surface > :not(.wallpaper-image):not(.wallpaper-scrim):not(.wallpaper-actions) { z-index: 2; }');
    expect(css).toMatch(/\.wallpaper-actions\s*\{[^}]*z-index:\s*3;/s);
  });

  test('wires the editor to module-ready runtime state and local draft saves', () => {
    expect(app).toContain('FAMILY_WALLPAPER_EDITOR.cropStyle');
    expect(app).toContain('openWallpaperEditor(change.dataset.wallpaperChange)');
    expect(app).toContain('function applyWallpaperCrop(image, wallpaper)');
    expect(app).toContain('function openWallpaperEditor(surface, file)');
    expect(app).toContain('async function saveWallpaperDraft(draft)');
    expect(app).toContain('await waitForWallpaperEditor();');
    expect(app).toMatch(/modulesReady\.then\(\(\) => \{\s+if \(initializeWallpaperEditor\(\)\) renderWallpapers\(\);/s);
    expect(app).toContain('state.wallpapers[draft.surface] = { path: existing?.path || "", url, ...crop };');
    expect(app).toMatch(/if \(!persistLocalWallpapers\(\)\) \{\s+state\.wallpapers\[draft\.surface\] = existing;\s+return false;/s);
  });

  test('delivers the full-fit stylesheet past mobile and PWA caches', () => {
    expect(html).toContain('config.js?v=20260815-wallpaper-dual-layer-v1');
    expect(html).toContain('app.js?v=20260815-wallpaper-dual-layer-v1');
    expect(config).toContain('{ name: "family-wallpapers", version: "20260815-dual-layer-v1", script: false }');
    expect(serviceWorker).toContain('url.pathname.endsWith("/family-wallpapers.css")');
  });
});
