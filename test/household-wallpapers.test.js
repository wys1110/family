import { describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('app.js');
const html = read('index.html');
const migration = read('supabase/migrations/20260810005856_household_wallpapers.sql');
const cropMigration = read('supabase/migrations/20260815024221_family_wallpaper_crop.sql');
const schema = read('supabase/schema.sql');
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

function createRemoteSaveHarness({ saveFails = false, signedUrlFails = false } = {}) {
  const previous = { path: 'household-1/wallpapers/calendar/old.jpg', url: 'old-signed.jpg', positionX: 50, positionY: 50, zoom: 1 };
  const state = {
    wallpapers: { calendar: previous, growth: null },
    household: { id: 'household-1' },
    session: { user: { id: 'user-1' } },
  };
  const filters = [];
  const table = {
    upsert: vi.fn((payload) => ({
      select: () => ({ single: async () => ({ error: saveFails ? new Error('db') : null, data: payload }) }),
    })),
    update: vi.fn(() => {
      const chain = {
        eq(column, value) { filters.push([column, value]); return chain; },
        select: () => ({ single: async () => ({ error: saveFails ? new Error('db') : null }) }),
      };
      return chain;
    }),
  };
  const storage = {
    upload: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null })),
    createSignedUrl: vi.fn(async () => signedUrlFails
      ? ({ data: null, error: new Error('signed url') })
      : ({ data: { signedUrl: 'new-signed.jpg' }, error: null })),
  };
  state.supabase = {
    from: vi.fn(() => table),
    storage: { from: vi.fn(() => storage) },
  };
  const toast = vi.fn();
  const renderWallpapers = vi.fn();
  const source = [
    app.slice(app.indexOf('function wallpaperExtension(file)'), app.indexOf('function chooseWallpaperPhoto(surface)')),
    app.slice(app.indexOf('async function saveWallpaperDraft(draft)'), app.indexOf('function initializeWallpaperEditor()')),
  ].join('\n');
  const createRuntime = new Function(
    'state', 'WALLPAPER_SURFACES', 'GROWTH_PHOTO_BUCKET', 'uid', 'toast', 'renderWallpapers',
    'window', 'photoDataUrl', 'persistLocalWallpapers', 'wallpaperPathIsOwned',
    `${source}\nreturn { saveWallpaper, saveWallpaperDraft };`,
  );
  const normalizeCrop = (value) => ({ positionX: value.positionX, positionY: value.positionY, zoom: value.zoom });
  const runtime = createRuntime(
    state, new Set(['calendar', 'growth']), 'growth-photos', () => 'new-id', toast, renderWallpapers,
    { FAMILY_WALLPAPER_EDITOR: { normalizeCrop } }, vi.fn(), vi.fn(),
    (path, householdId, surface) => path.startsWith(`${householdId}/wallpapers/${surface}/`),
  );
  return { ...runtime, state, previous, table, storage, filters, toast, renderWallpapers };
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

  test('stores bounded crop metadata with safe defaults in migrations and the canonical schema', () => {
    for (const sql of [cropMigration, schema]) {
      expect(sql).toMatch(/position_x double precision not null default 50/);
      expect(sql).toMatch(/position_y double precision not null default 50/);
      expect(sql).toMatch(/zoom double precision not null default 1/);
      expect(sql).toMatch(/household_wallpapers_position_x_check check \(position_x between 0 and 100\)/);
      expect(sql).toMatch(/household_wallpapers_position_y_check check \(position_y between 0 and 100\)/);
      expect(sql).toMatch(/household_wallpapers_zoom_check check \(zoom between 1 and 3\)/);
    }
  });

  test('hydrates remote crop values through the shared normalizer', () => {
    expect(app).toContain('const crop = window.FAMILY_WALLPAPER_EDITOR.normalizeCrop(row);');
    expect(app).toContain('{ path: row.photo_path, url: urls.get(row.photo_path) || "", ...crop }');
  });

  test('persists new-photo crop metadata and scopes crop-only updates to household and surface', () => {
    expect(app).toContain('position_x: crop.positionX');
    expect(app).toContain('position_y: crop.positionY');
    expect(app).toContain('zoom: crop.zoom');
    expect(app).toMatch(/\.update\(\{ position_x: crop\.positionX, position_y: crop\.positionY, zoom: crop\.zoom \}\)[\s\S]*?\.eq\("household_id", state\.household\.id\)[\s\S]*?\.eq\("surface", surface\)/);
  });

  test('keeps remote state unchanged and cleans up an uploaded photo when its row save fails', async () => {
    const harness = createRemoteSaveHarness({ saveFails: true });
    const saved = await harness.saveWallpaperDraft({
      surface: 'calendar', file: { type: 'image/jpeg' }, positionX: 20, positionY: 70, zoom: 1.8,
    });

    expect(saved).toBe(false);
    expect(harness.table.upsert).toHaveBeenCalledWith(expect.objectContaining({
      household_id: 'household-1', surface: 'calendar', position_x: 20, position_y: 70, zoom: 1.8,
    }));
    expect(harness.storage.remove).toHaveBeenCalledWith(['household-1/wallpapers/calendar/new-id.jpg']);
    expect(harness.state.wallpapers.calendar).toBe(harness.previous);
  });

  test('does not change the row or remove the previous photo when a signed URL cannot be prepared', async () => {
    const harness = createRemoteSaveHarness({ signedUrlFails: true });
    const saved = await harness.saveWallpaperDraft({
      surface: 'calendar', file: { type: 'image/jpeg' }, positionX: 20, positionY: 70, zoom: 1.8,
    });

    expect(saved).toBe(false);
    expect(harness.table.upsert).not.toHaveBeenCalled();
    expect(harness.storage.remove).toHaveBeenCalledTimes(1);
    expect(harness.storage.remove).toHaveBeenCalledWith(['household-1/wallpapers/calendar/new-id.jpg']);
    expect(harness.state.wallpapers.calendar).toBe(harness.previous);
    expect(harness.toast).toHaveBeenCalledWith('사진을 표시할 준비를 하지 못했어요. 다시 시도해 주세요');
  });

  test('updates crop metadata for only the current household surface before mutating memory', async () => {
    const harness = createRemoteSaveHarness();
    const saved = await harness.saveWallpaperDraft({
      surface: 'calendar', positionX: 30, positionY: 65, zoom: 2.1,
    });

    expect(saved).toBe(true);
    expect(harness.table.update).toHaveBeenCalledWith({ position_x: 30, position_y: 65, zoom: 2.1 });
    expect(harness.filters).toEqual([
      ['household_id', 'household-1'],
      ['surface', 'calendar'],
    ]);
    expect(harness.state.wallpapers.calendar).toEqual({ ...harness.previous, positionX: 30, positionY: 65, zoom: 2.1 });
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
    expect(config).toContain('{ name: "family-wallpapers", version: "20260815-editor-v1", script: false }');
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

  test('delivers the wallpaper editor assets past mobile and PWA caches', () => {
    expect(html).toContain('config.js?v=20260815-wallpaper-editor-v1');
    expect(html).toContain('app.js?v=20260815-wallpaper-editor-v1');
    expect(config).toContain('{ name: "family-wallpapers", version: "20260815-editor-v1", script: false }');
    expect(config).toContain('{ name: "wallpaper-editor", version: "20260815-v1" }');
    expect(serviceWorker).toContain('url.pathname.endsWith("/family-wallpapers.css")');
  });
});
