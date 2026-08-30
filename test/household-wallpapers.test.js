import { describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const productionSource = fs.readdirSync(new URL('..', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(?:css|js|html)$/.test(entry.name))
  .map((entry) => read(entry.name))
  .join('\n');
const app = read('app.js');
const html = read('index.html');
const migration = read('supabase/migrations/20260810005856_household_wallpapers.sql');
const cropMigration = read('supabase/migrations/20260815024221_family_wallpaper_crop.sql');
const schema = read('supabase/schema.sql');
const css = read('family-wallpapers.css');
const baseCss = read('styles.css');
const responsiveCss = read('responsive-layout.css');
const typographyCss = read('typography-system.css');
const growthLayoutCss = read('growth-layout.css');
const config = read('config.js');
const serviceWorker = read('service-worker.js');
const editorSource = read('wallpaper-editor.js');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

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

function createRemoteSaveHarness({ saveFails = false, signedUrlFails = false, signedUrlDeferred = null, updateDeferred = null, deleteDeferred = null } = {}) {
  const previous = { path: 'household-1/wallpapers/calendar/old.jpg', url: 'old-signed.jpg', positionX: 50, positionY: 50, zoom: 1 };
  const state = {
    wallpapers: { calendar: previous, growth: null },
    household: { id: 'household-1' },
    session: { user: { id: 'user-1' } },
  };
  const filters = [];
  const deleteFilters = [];
  const table = {
    upsert: vi.fn((payload) => ({
      select: () => ({ single: async () => ({ error: saveFails ? new Error('db') : null, data: payload }) }),
    })),
    update: vi.fn(() => {
      const chain = {
        eq(column, value) { filters.push([column, value]); return chain; },
        select: () => ({ single: async () => updateDeferred?.promise || ({ error: saveFails ? new Error('db') : null }) }),
      };
      return chain;
    }),
    delete: vi.fn(() => {
      const result = deleteDeferred?.promise || Promise.resolve({ error: saveFails ? new Error('db') : null });
      const chain = {
        eq(column, value) { deleteFilters.push([column, value]); return chain; },
        then(resolve, reject) { return result.then(resolve, reject); },
      };
      return chain;
    }),
  };
  const storage = {
    upload: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null })),
    createSignedUrl: vi.fn(async () => signedUrlDeferred?.promise || (signedUrlFails
      ? ({ data: null, error: new Error('signed url') })
      : ({ data: { signedUrl: 'new-signed.jpg' }, error: null }))),
  };
  const supabase = {
    from: vi.fn(() => table),
    storage: { from: vi.fn(() => storage) },
  };
  state.supabase = supabase;
  const toast = vi.fn();
  const renderWallpapers = vi.fn();
  const source = [
    app.slice(app.indexOf('function normalizeWallpaperCrop'), app.indexOf('function applyWallpaperCrop')),
    app.slice(app.indexOf('function wallpaperExtension(file)'), app.indexOf('function chooseWallpaperPhoto(surface)')),
    app.slice(app.indexOf('async function saveWallpaperDraft(draft)'), app.indexOf('function initializeWallpaperEditor()')),
    app.slice(app.indexOf('async function removeWallpaper(surface)'), app.indexOf('function releaseTouchTabFocus(event)')),
  ].join('\n');
  const createRuntime = new Function(
    'state', 'WALLPAPER_SURFACES', 'GROWTH_PHOTO_BUCKET', 'uid', 'toast', 'renderWallpapers',
    'window', 'withAuthRecovery', 'photoDataUrl', 'persistLocalWallpapers', 'wallpaperPathIsOwned',
    `${source}\nreturn { saveWallpaper, saveWallpaperDraft, removeWallpaper };`,
  );
  const normalizeCrop = (value) => ({ positionX: value.positionX, positionY: value.positionY, zoom: value.zoom });
  const runtime = createRuntime(
    state, new Set(['calendar', 'growth']), 'growth-photos', () => 'new-id', toast, renderWallpapers,
    { FAMILY_WALLPAPER_EDITOR: { normalizeCrop } }, (operation) => operation(), vi.fn(), vi.fn(),
    (path, householdId, surface) => path.startsWith(`${householdId}/wallpapers/${surface}/`),
  );
  return { ...runtime, state, previous, supabase, table, storage, filters, deleteFilters, toast, renderWallpapers };
}

function createHydrationHarness({ editorAvailable = true } = {}) {
  const signedUrls = deferred();
  const h1Wallpapers = { calendar: null, growth: null };
  const state = {
    wallpapers: h1Wallpapers,
    household: { id: 'household-1' },
    session: { user: { id: 'user-1' } },
  };
  const storage = { createSignedUrls: vi.fn(() => signedUrls.promise) };
  const supabase = { storage: { from: vi.fn(() => storage) } };
  state.supabase = supabase;
  const renderWallpapers = vi.fn();
  const normalizeCrop = (value) => ({ positionX: value.position_x, positionY: value.position_y, zoom: value.zoom });
  const source = [
    app.slice(app.indexOf('function normalizeWallpaperCrop'), app.indexOf('function applyWallpaperCrop')),
    app.slice(app.indexOf('async function hydrateWallpaperUrls'), app.indexOf('async function photoDataUrl')),
  ].join('\n');
  const createRuntime = new Function(
    'state', 'WALLPAPER_SURFACES', 'GROWTH_PHOTO_BUCKET', 'wallpaperPathIsOwned', 'renderWallpapers', 'window', 'withAuthRecovery',
    `${source}\nreturn hydrateWallpaperUrls;`,
  );
  const hydrateWallpaperUrls = createRuntime(
    state, new Set(['calendar', 'growth']), 'growth-photos',
    (path, householdId, surface) => path.startsWith(`${householdId}/wallpapers/${surface}/`),
    renderWallpapers, editorAvailable ? { FAMILY_WALLPAPER_EDITOR: { normalizeCrop } } : {}, (operation) => operation(),
  );
  return { state, supabase, storage, signedUrls, h1Wallpapers, renderWallpapers, hydrateWallpaperUrls };
}

describe('family wallpaper', () => {
  test('keeps one shared wallpaper per household and surface', () => {
    expect(migration).toContain("surface text not null check (surface in ('calendar', 'growth'))");
    expect(migration).toContain('primary key (household_id, surface)');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('public.is_household_owner(household_id)');
  });

  test('uses household-scoped storage paths and the active household only', () => {
    expect(app).toContain("`${context.householdId}/wallpapers/${surface}/");
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
    expect(app).toContain('const crop = normalizeWallpaperCrop(row);');
    expect(app).toContain('{ path: row.photo_path, url: urls.get(row.photo_path) || "", ...crop }');
  });

  test('hydrates safely without the optional editor module', async () => {
    const harness = createHydrationHarness({ editorAvailable: false });
    const pending = harness.hydrateWallpaperUrls([{
      household_id: 'household-1', surface: 'calendar',
      photo_path: 'household-1/wallpapers/calendar/photo.jpg', position_x: 25, position_y: 75, zoom: 1.5,
    }], 'household-1');
    harness.signedUrls.resolve({ data: [{ path: 'household-1/wallpapers/calendar/photo.jpg', signedUrl: 'signed.jpg' }], error: null });

    await expect(pending).resolves.toBe(true);
    expect(harness.state.wallpapers.calendar).toEqual({
      path: 'household-1/wallpapers/calendar/photo.jpg', url: 'signed.jpg', positionX: 25, positionY: 75, zoom: 1.5,
    });
  });

  test('does not let late H1 hydration overwrite H2 wallpaper state', async () => {
    const harness = createHydrationHarness();
    const pending = harness.hydrateWallpaperUrls([{
      household_id: 'household-1', surface: 'calendar',
      photo_path: 'household-1/wallpapers/calendar/photo.jpg', position_x: 50, position_y: 50, zoom: 1,
    }], 'household-1');
    const h2Wallpapers = { calendar: { path: 'h2.jpg', url: 'h2-signed.jpg' }, growth: null };
    harness.state.supabase = { storage: { from: vi.fn() } };
    harness.state.household = { id: 'household-2' };
    harness.state.session = { user: { id: 'user-2' } };
    harness.state.wallpapers = h2Wallpapers;
    harness.signedUrls.resolve({ data: [{ path: 'household-1/wallpapers/calendar/photo.jpg', signedUrl: 'h1-signed.jpg' }], error: null });

    expect(await pending).toBe(false);
    expect(harness.state.wallpapers).toBe(h2Wallpapers);
    expect(harness.renderWallpapers).not.toHaveBeenCalled();
  });

  test('persists new-photo crop metadata and scopes crop-only updates to household and surface', () => {
    expect(app).toContain('position_x: crop.positionX');
    expect(app).toContain('position_y: crop.positionY');
    expect(app).toContain('zoom: crop.zoom');
    expect(app).toMatch(/\.update\(\{ position_x: crop\.positionX, position_y: crop\.positionY, zoom: crop\.zoom \}\)[\s\S]*?\.eq\("household_id", context\.householdId\)[\s\S]*?\.eq\("surface", surface\)/);
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

  test('cleans an H1 upload without touching H2 when signed URL work finishes late', async () => {
    const signedUrlDeferred = deferred();
    const harness = createRemoteSaveHarness({ signedUrlDeferred });
    const pending = harness.saveWallpaperDraft({
      surface: 'calendar', file: { type: 'image/jpeg' }, positionX: 20, positionY: 70, zoom: 1.8,
    });
    await vi.waitFor(() => expect(harness.storage.createSignedUrl).toHaveBeenCalled());
    const h2Wallpaper = { path: 'household-2/wallpapers/calendar/h2.jpg', url: 'h2.jpg' };
    const h2Upsert = vi.fn(() => ({ select: () => ({ single: async () => ({ error: null }) }) }));
    const h2Storage = { remove: vi.fn(async () => ({ error: null })) };
    harness.state.supabase = { from: () => ({ upsert: h2Upsert }), storage: { from: () => h2Storage } };
    harness.state.household = { id: 'household-2' };
    harness.state.session = { user: { id: 'user-2' } };
    harness.state.wallpapers = { calendar: h2Wallpaper, growth: null };
    signedUrlDeferred.resolve({ data: { signedUrl: 'h1-new.jpg' }, error: null });

    expect(await pending).toBe(false);
    expect(h2Upsert).not.toHaveBeenCalled();
    expect(harness.storage.remove).toHaveBeenCalledWith(['household-1/wallpapers/calendar/new-id.jpg']);
    expect(h2Storage.remove).not.toHaveBeenCalled();
    expect(harness.state.wallpapers.calendar).toBe(h2Wallpaper);
  });

  test('does not let an H1 crop update completion mutate H2', async () => {
    const updateDeferred = deferred();
    const harness = createRemoteSaveHarness({ updateDeferred });
    const pending = harness.saveWallpaperDraft({ surface: 'calendar', positionX: 30, positionY: 65, zoom: 2.1 });
    await vi.waitFor(() => expect(harness.table.update).toHaveBeenCalled());
    const h2Wallpaper = { path: 'household-2/wallpapers/calendar/h2.jpg', url: 'h2.jpg' };
    harness.state.supabase = { from: vi.fn(), storage: { from: vi.fn() } };
    harness.state.household = { id: 'household-2' };
    harness.state.session = { user: { id: 'user-2' } };
    harness.state.wallpapers = { calendar: h2Wallpaper, growth: null };
    updateDeferred.resolve({ error: null });

    expect(await pending).toBe(false);
    expect(harness.state.wallpapers.calendar).toBe(h2Wallpaper);
    expect(harness.renderWallpapers).not.toHaveBeenCalled();
  });

  test('finishes H1 delete cleanup without clearing H2 state', async () => {
    const deleteDeferred = deferred();
    const harness = createRemoteSaveHarness({ deleteDeferred });
    const pending = harness.removeWallpaper('calendar');
    await vi.waitFor(() => expect(harness.table.delete).toHaveBeenCalled());
    const h2Wallpaper = { path: 'household-2/wallpapers/calendar/h2.jpg', url: 'h2.jpg' };
    const h2Storage = { remove: vi.fn(async () => ({ error: null })) };
    harness.state.supabase = { from: vi.fn(), storage: { from: () => h2Storage } };
    harness.state.household = { id: 'household-2' };
    harness.state.session = { user: { id: 'user-2' } };
    harness.state.wallpapers = { calendar: h2Wallpaper, growth: null };
    deleteDeferred.resolve({ error: null });

    expect(await pending).toBe(false);
    expect(harness.storage.remove).toHaveBeenCalledWith(['household-1/wallpapers/calendar/old.jpg']);
    expect(h2Storage.remove).not.toHaveBeenCalled();
    expect(harness.state.wallpapers.calendar).toBe(h2Wallpaper);
    expect(harness.renderWallpapers).not.toHaveBeenCalled();
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

  test('removes the baby monogram and reserves photo space only for active growth wallpapers', () => {
    expect(productionSource).not.toContain('babyMonogram');
    expect(productionSource).not.toContain('.baby-monogram');
    expect(html).not.toContain('id="babyMonogram"');
    expect(html).not.toContain('class="baby-monogram"');
    expect(app).not.toContain('$("#babyMonogram")');
    expect(baseCss).not.toContain('.baby-monogram');
    expect(responsiveCss).not.toContain('.baby-monogram');
    expect(typographyCss).not.toContain('.baby-monogram');
    expect(baseCss).toMatch(/\.baby-profile-main\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) auto;/s);
    expect(baseCss).toContain('.baby-care-card .baby-edit-button { margin:12px 0 0 22px; }');
    expect(growthLayoutCss).not.toContain('margin: 10px 0 0 94px;');
    expect(growthLayoutCss).not.toContain('margin-left: 79px;');
    expect(growthLayoutCss).toContain('.baby-care-card .baby-edit-button { min-height: 32px; margin: 12px 0 0 22px; padding: 0 10px; }');
    const mobileGrowthLayoutCss = growthLayoutCss.slice(growthLayoutCss.indexOf('@media (max-width: 520px)'));
    expect(mobileGrowthLayoutCss).toContain('.baby-care-card .baby-profile-main { padding: 19px 18px 0; }');
    expect(mobileGrowthLayoutCss).toContain('.baby-care-card .baby-edit-button { margin-left: 18px; }');
    expect(css).toContain('.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"] .baby-profile-main { padding-left: calc(22px + 72px); }');
    expect(css).toContain('.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"] .baby-edit-button { margin-left: calc(22px + 72px); }');
    const mobileWallpaperCss = css.slice(css.indexOf('@media (max-width: 520px)'));
    expect(mobileWallpaperCss).toContain('.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"] .baby-profile-main { padding-left: calc(18px + 63px); }');
    expect(mobileWallpaperCss).toContain('.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"] .baby-edit-button { margin-left: calc(18px + 63px); }');
    expect(config).toContain('{ name: "growth-layout", version: "20260816-growth-monogram-v1", script: false }');
  });

  test('removes legacy hero decorations from active calendar wallpapers', () => {
    expect(css).toMatch(/\.hero-card\.wallpaper-surface\.has-wallpaper\[data-wallpaper-surface="calendar"\]::before,\s*\.hero-card\.wallpaper-surface\.has-wallpaper\[data-wallpaper-surface="calendar"\]::after,\s*\.baby-profile-card\.wallpaper-surface\.has-wallpaper\[data-wallpaper-surface="growth"\]::before,\s*\.baby-profile-card\.wallpaper-surface\.has-wallpaper\[data-wallpaper-surface="growth"\]::after\s*\{\s*content:\s*none;\s*\}/s);
  });

  test('fills calendar and growth cards with one sharp cover image', () => {
    expect(css).toMatch(/\.wallpaper-image\s*\{[^}]*object-fit:\s*cover;/s);
    expect(css).not.toContain('.wallpaper-backdrop');
    expect(css).not.toContain('blur(16px)');
    expect(css).toMatch(/\.wallpaper-image\s*\{[^}]*z-index:\s*0;/s);
    expect(css).toMatch(/\.wallpaper-scrim\s*\{[^}]*z-index:\s*1;/s);
    expect(css).toContain('.wallpaper-surface.has-wallpaper .family-mascot { display: none; }');
    expect(css).not.toContain('var(--wallpaper-image)');
    expect(config).toContain('{ name: "family-wallpapers", version: "20260816-growth-monogram-v1", script: false }');
  });

  test('keeps wallpaper actions above the content layer', () => {
    expect(css).toContain('.wallpaper-surface > :not(.wallpaper-image):not(.wallpaper-scrim):not(.wallpaper-actions) { z-index: 2; }');
    expect(css).toMatch(/\.wallpaper-actions\s*\{[^}]*z-index:\s*3;/s);
    expect(css).toMatch(/\.wallpaper-actions button\s*\{[^}]*min-height:\s*44px;/s);
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
    expect(html).toContain('theme-critical.css?v=20260815-wallpaper-brightness-v1');
    expect(html).toContain('config.js?v=20260830-data-load-v3');
    expect(html).toContain('app.js?v=20260830-data-load-v4');
    expect(config).toContain('{ name: "family-wallpapers", version: "20260816-growth-monogram-v1", script: false }');
    expect(config).toContain('{ name: "wallpaper-editor", version: "20260815-v1" }');
    expect(serviceWorker).toContain('url.pathname.endsWith("/family-wallpapers.css")');
  });
});
