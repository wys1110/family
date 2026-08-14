import { describe, expect, test } from 'vitest';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('app.js');
const html = read('index.html');
const migration = read('supabase/migrations/20260810005856_household_wallpapers.sql');
const css = read('family-wallpapers.css');
const config = read('config.js');
const serviceWorker = read('service-worker.js');

function createWallpaperHarness(url) {
  const attributes = new Map();
  const classes = new Set();
  const image = {
    dataset: {},
    hidden: true,
    onerror: null,
    srcAssignments: 0,
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
    querySelector(selector) { return selector === '[data-wallpaper-image]' ? image : removeButton; },
  };
  const document = { querySelectorAll() { return [node]; } };
  const state = { wallpapers: { calendar: { url } } };
  const start = app.indexOf('function renderWallpapers()');
  const end = app.indexOf('async function hydrateWallpaperUrls', start);
  const createRenderer = new Function('document', 'state', `${app.slice(start, end)}\nreturn renderWallpapers;`);
  return { image, node, state, render: createRenderer(document, state) };
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
    expect(html.match(/data-wallpaper-image=/g)).toHaveLength(2);
    expect(html.match(/class="wallpaper-image"/g)).toHaveLength(2);
    expect(html.match(/class="wallpaper-scrim"/g)).toHaveLength(2);
    expect(app).toContain('const image = node.querySelector("[data-wallpaper-image]")');
    expect(app).toContain('image.src = url');
    expect(app).toContain('image.hidden = !showImage');
    expect(app).not.toContain('node.style.setProperty("--wallpaper-image"');
  });

  test('falls back to the default card when a wallpaper image fails', () => {
    expect(app).toContain('image.onerror = showImage ? () =>');
    expect(app).toContain('node.classList.remove("has-wallpaper")');
    expect(app).toContain('image.hidden = true');
    expect(app).toMatch(/image\.onerror = showImage \? \(\) => \{[^}]+image\.hidden = true;\s+image\.removeAttribute\("src"\);/s);
  });

  test('does not retry a failed wallpaper until its signed URL changes', () => {
    const harness = createWallpaperHarness('https://example.test/old-signed-url');
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

  test('shows the full calendar and growth wallpaper without cropping or mascot overlap', () => {
    expect(css).toMatch(/\.wallpaper-image\s*\{[^}]*object-fit:\s*contain;/s);
    expect(css).toMatch(/\.wallpaper-image\s*\{[^}]*object-position:\s*right center;/s);
    expect(css).toContain('.wallpaper-surface.has-wallpaper .family-mascot { display: none; }');
    expect(css).not.toContain('var(--wallpaper-image)');
    expect(config).toContain('{ name: "family-wallpapers", version: "20260814-image-layer-v1", script: false }');
  });

  test('delivers the full-fit stylesheet past mobile and PWA caches', () => {
    expect(html).toContain('config.js?v=20260814-wallpaper-image-layer-v1');
    expect(html).toContain('app.js?v=20260814-wallpaper-image-layer-v1');
    expect(config).toContain('{ name: "family-wallpapers", version: "20260814-image-layer-v1", script: false }');
    expect(serviceWorker).toContain('url.pathname.endsWith("/family-wallpapers.css")');
  });
});
