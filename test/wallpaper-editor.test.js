import { describe, expect, test, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";
const source = read("wallpaper-editor.js");
const app = read("app.js");
const html = read("index.html");
const css = read("wallpaper-editor.css");
const config = read("config.js");

function loadApi(extraWindow = {}) {
  const window = { ...extraWindow };
  vm.runInNewContext(source, { window });
  return window.FAMILY_WALLPAPER_EDITOR;
}

function eventTarget(initial = {}) {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(type, listener) {
      const typeListeners = listeners.get(type) || [];
      typeListeners.push(listener);
      listeners.set(type, typeListeners);
    },
    dispatch(type, event = {}) {
      return Promise.all((listeners.get(type) || []).map((listener) =>
        listener({ preventDefault() {}, ...event, currentTarget: this })));
    },
  };
}

function createHarness() {
  const dialog = eventTarget({
    dataset: {},
    open: false,
    showModal: vi.fn(function showModal() { this.open = true; }),
    close: vi.fn(function close() { this.open = false; this.dispatch("close"); }),
  });
  const previewImage = eventTarget({ style: {}, src: "" });
  const preview = eventTarget({
    dataset: {},
    querySelector: () => previewImage,
    getBoundingClientRect: () => ({ width: 200, height: 100 }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  });
  const zoomInput = eventTarget({ value: "1" });
  const zoomOutput = { value: "", textContent: "" };
  const choose = eventTarget();
  const reset = eventTarget();
  const cancel = eventTarget();
  const apply = eventTarget();
  const onSave = vi.fn();
  const onChoosePhoto = vi.fn();
  const createObjectURL = vi.fn(() => "blob:editor-preview");
  const revokeObjectURL = vi.fn();
  const api = loadApi({ URL: { createObjectURL, revokeObjectURL } });
  const controller = api.createController({
    dialog,
    preview,
    zoomInput,
    zoomOutput,
    chooseButton: choose,
    resetButton: reset,
    cancelButton: cancel,
    applyButton: apply,
    onSave,
    onChoosePhoto,
  });
  return {
    api, controller, dialog, preview, previewImage, zoomInput, zoomOutput,
    choose, reset, cancel, apply, onSave, onChoosePhoto, createObjectURL, revokeObjectURL,
  };
}

function appSlice(startMarker, endMarker) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start);
  return app.slice(start, end);
}

function createModuleWaitHarness(modulesReady) {
  let releaseTimeout;
  const initializeWallpaperEditor = vi.fn(() => true);
  const renderWallpapers = vi.fn();
  const setTimeout = vi.fn((resolve) => { releaseTimeout = resolve; });
  const source = appSlice("async function waitForWallpaperEditor()", "function authSessionKey");
  const createWaiter = new Function(
    "window", "initializeWallpaperEditor", "renderWallpapers", "setTimeout",
    `${source}\nreturn waitForWallpaperEditor;`,
  );
  return {
    wait: createWaiter({ FAMILY_MODULES_READY: modulesReady }, initializeWallpaperEditor, renderWallpapers, setTimeout),
    initializeWallpaperEditor,
    renderWallpapers,
    releaseTimeout: () => releaseTimeout(),
  };
}

function createLocalSaveHarness({ persistFails = false } = {}) {
  const previous = { path: "", url: "old.jpg", positionX: 50, positionY: 50, zoom: 1 };
  const state = { wallpapers: { calendar: previous }, supabase: null, session: null, household: null };
  const localStorage = {
    setItem: vi.fn(() => { if (persistFails) throw new Error("quota"); }),
  };
  const toast = vi.fn();
  const renderWallpapers = vi.fn();
  const normalizeCrop = (value) => ({ positionX: value.positionX, positionY: value.positionY, zoom: value.zoom });
  const source = [
    appSlice("function persistLocalWallpapers()", "function wallpaperPathIsOwned"),
    appSlice("async function saveWallpaperDraft(draft)", "function initializeWallpaperEditor"),
  ].join("\n");
  const createRuntime = new Function(
    "localStorage", "WALLPAPER_STORAGE_KEY", "state", "toast", "renderWallpapers",
    "window", "WALLPAPER_SURFACES", "photoDataUrl",
    `${source}\nreturn { persistLocalWallpapers, saveWallpaperDraft };`,
  );
  const runtime = createRuntime(
    localStorage, "wallpapers", state, toast, renderWallpapers,
    { FAMILY_WALLPAPER_EDITOR: { normalizeCrop } }, new Set(["calendar"]), vi.fn(),
  );
  return { ...runtime, previous, state, localStorage, toast, renderWallpapers };
}

function createPhotoPreparationHarness(prepareGrowthPhoto) {
  const openWallpaperEditor = vi.fn();
  const source = [
    appSlice("function invalidateWallpaperPhotoSelection()", "async function prepareWallpaperEditorPhoto"),
    appSlice("async function prepareWallpaperEditorPhoto", "async function removeWallpaper"),
  ].join("\n");
  const createRuntime = new Function(
    "prepareGrowthPhoto", "openWallpaperEditor", "wallpaperPhotoSelectionGeneration",
    `${source}\nreturn { invalidateWallpaperPhotoSelection, prepareWallpaperEditorPhoto };`,
  );
  return { ...createRuntime(prepareGrowthPhoto, openWallpaperEditor, 1), openWallpaperEditor };
}

describe("wallpaper editor core", () => {
  test("loads without a document and normalizes legacy or out-of-range crop values", () => {
    const api = loadApi();
    expect(api.normalizeCrop({ positionX: -4, positionY: 140, zoom: 7 }))
      .toEqual({ positionX: 0, positionY: 100, zoom: 3 });
    expect(api.normalizeCrop({ position_x: 25, position_y: 75, zoom: 1.4 }))
      .toEqual({ positionX: 25, positionY: 75, zoom: 1.4 });
  });

  test("calculates drag, pinch, and crop styles without DOM state", () => {
    const api = loadApi();
    expect(api.dragCrop({ positionX: 50, positionY: 50, zoom: 1 }, 40, -20, 200, 100))
      .toEqual({ positionX: 30, positionY: 70, zoom: 1 });
    expect(api.pinchZoom(1.5, 100, 160)).toBe(2.4);
    expect(api.cropStyle({ positionX: 30, positionY: 70, zoom: 1.5 }))
      .toEqual({ objectPosition: "30% 70%", transform: "scale(1.5)", transformOrigin: "30% 70%" });
  });
});

describe("wallpaper editor controller", () => {
  test("keeps changes in draft state and saves only from apply", () => {
    const harness = createHarness();
    harness.controller.open({ surface: "calendar", url: "old.jpg", positionX: 25, positionY: 75, zoom: 1.4 });
    harness.zoomInput.value = "2.25";
    harness.zoomInput.dispatch("input");
    expect(harness.zoomOutput.textContent).toBe("2.25×");
    expect(harness.onSave).not.toHaveBeenCalled();
    harness.cancel.dispatch("click");
    expect(harness.onSave).not.toHaveBeenCalled();

    harness.controller.open({ surface: "growth", url: "growth.jpg", positionX: 40, positionY: 60, zoom: 1.2 });
    harness.apply.dispatch("click");
    expect(harness.onSave).toHaveBeenCalledWith({ surface: "growth", file: undefined, positionX: 40, positionY: 60, zoom: 1.2 });
  });

  test("keeps the editor open when persistence fails", async () => {
    const harness = createHarness();
    harness.onSave.mockResolvedValue(false);
    harness.controller.open({ surface: "calendar", url: "old.jpg", zoom: 1 });

    await harness.apply.dispatch("click");

    expect(harness.dialog.close).not.toHaveBeenCalled();
    expect(harness.dialog.open).toBe(true);
  });

  test("resets crop, requests a replacement, and revokes only its own object URLs", () => {
    const harness = createHarness();
    const file = { name: "family.jpg" };
    harness.controller.open({ surface: "calendar", url: "signed.jpg", file, positionX: 8, positionY: 92, zoom: 2.2 });
    expect(harness.createObjectURL).toHaveBeenCalledWith(file);
    expect(harness.previewImage.src).toBe("blob:editor-preview");
    harness.reset.dispatch("click");
    expect(harness.zoomOutput.textContent).toBe("1.00×");
    harness.choose.dispatch("click");
    expect(harness.onChoosePhoto).toHaveBeenCalledWith("calendar");
    harness.dialog.dispatch("close");
    expect(harness.revokeObjectURL).toHaveBeenCalledWith("blob:editor-preview");

    harness.controller.open({ surface: "growth", url: "https://example.test/signed.jpg", zoom: 1 });
    harness.dialog.dispatch("close");
    expect(harness.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  test("uses pointer capture for one-pointer drag and two-pointer pinch", () => {
    const harness = createHarness();
    harness.controller.open({ surface: "calendar", url: "photo.jpg", positionX: 50, positionY: 50, zoom: 1 });
    harness.preview.dispatch("pointerdown", { pointerId: 1, clientX: 20, clientY: 20 });
    harness.preview.dispatch("pointermove", { pointerId: 1, clientX: 60, clientY: 0 });
    expect(harness.preview.setPointerCapture).toHaveBeenCalledWith(1);
    expect(harness.previewImage.style.objectPosition).toBe("30% 70%");

    harness.preview.dispatch("pointerdown", { pointerId: 2, clientX: 100, clientY: 20 });
    harness.preview.dispatch("pointermove", { pointerId: 2, clientX: 180, clientY: 20 });
    expect(Number(harness.zoomInput.value)).toBeGreaterThan(1);
  });
});

describe("wallpaper editor surface", () => {
  test("provides the native dialog controls and manifest entry", () => {
    expect(html).toContain("월페이퍼 맞추기");
    expect(html).toContain("다른 사진 선택");
    for (const id of [
      "wallpaperEditorDialog", "wallpaperEditorPreview", "wallpaperEditorZoom",
      "wallpaperEditorZoomValue", "wallpaperEditorChoose", "wallpaperEditorReset",
      "wallpaperEditorCancel", "wallpaperEditorApply",
    ]) expect(html).toContain(`id="${id}"`);
    expect(html).toMatch(/id="wallpaperEditorZoom"[^>]*type="range"[^>]*min="1"[^>]*max="3"[^>]*step="0\.01"/);
    expect(html).toContain("초기화");
    expect(html).toContain("취소");
    expect(html).toContain("적용");
    expect(config).toContain('{ name: "wallpaper-editor", version: "20260815-v1" }');
  });

  test("uses target-card ratios, restrained crop affordance, and accessible touch targets", () => {
    expect(css).toMatch(/\.wallpaper-editor-preview\s*\{[^}]*overflow:\s*hidden;[^}]*touch-action:\s*none;/s);
    expect(css).toContain('aspect-ratio: 2.55 / 1');
    expect(css).toContain('aspect-ratio: 2.05 / 1');
    expect(css).toMatch(/\.wallpaper-editor-preview img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*cover;/s);
    expect(css).toContain("--theme-wallpaper-border");
    expect(css).toContain("min-height: 44px");
    expect(css).toMatch(/\.wallpaper-editor-dialog \.close-button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
    expect(css).toContain(".wallpaper-editor-crop-corner");
  });

  test("initializes one app controller only after the module is ready", () => {
    expect(app.match(/FAMILY_WALLPAPER_EDITOR\.createController\(/g)).toHaveLength(1);
    expect(app).toContain("await waitForWallpaperEditor();");
  });

  test("keeps the app usable when the editor module fails to load", () => {
    expect(app.match(/if \(!window\.FAMILY_WALLPAPER_EDITOR\) return;/g)).toHaveLength(1);
    expect(app).toContain("if (wallpaperEditorController || !window.FAMILY_WALLPAPER_EDITOR) return false;");
    expect(app).toContain("if (!wallpaperEditorController) return;");
  });

  test("bounds core bootstrap but initializes and rerenders after late module readiness", async () => {
    let resolveModules;
    const modulesReady = new Promise((resolve) => { resolveModules = resolve; });
    const harness = createModuleWaitHarness(modulesReady);

    const waiting = harness.wait();
    harness.releaseTimeout();
    await waiting;
    expect(harness.initializeWallpaperEditor).not.toHaveBeenCalled();

    resolveModules();
    await modulesReady;
    await Promise.resolve();
    expect(harness.initializeWallpaperEditor).toHaveBeenCalledTimes(1);
    expect(harness.renderWallpapers).toHaveBeenCalledTimes(1);
  });

  test("rolls back a local draft and reports no success when persistence fails", async () => {
    const failed = createLocalSaveHarness({ persistFails: true });
    const result = await failed.saveWallpaperDraft({ surface: "calendar", positionX: 25, positionY: 80, zoom: 1.6 });
    expect(result).toBe(false);
    expect(failed.state.wallpapers.calendar).toBe(failed.previous);
    expect(failed.renderWallpapers).not.toHaveBeenCalled();
    expect(failed.toast).toHaveBeenCalledTimes(1);
    expect(failed.toast).toHaveBeenCalledWith("사진을 이 기기에 저장하지 못했어요");
    expect(failed.toast).not.toHaveBeenCalledWith("이 기기에 월페이퍼를 설정했어요");

    const saved = createLocalSaveHarness();
    expect(await saved.saveWallpaperDraft({ surface: "calendar", positionX: 25, positionY: 80, zoom: 1.6 })).toBe(true);
    expect(saved.state.wallpapers.calendar).toEqual({ path: "", url: "old.jpg", positionX: 25, positionY: 80, zoom: 1.6 });
    expect(saved.renderWallpapers).toHaveBeenCalledTimes(1);
    expect(saved.toast).toHaveBeenCalledWith("이 기기에 월페이퍼를 설정했어요");
  });

  test("does not reopen the editor when photo preparation finishes after close", async () => {
    expect(app).toContain('await prepareWallpaperEditorPhoto(surface, file, generation);');
    expect(app).toContain('$("#wallpaperEditorDialog").addEventListener("close", invalidateWallpaperPhotoSelection);');
    let resolvePreparation;
    const prepareGrowthPhoto = vi.fn(() => new Promise((resolve) => { resolvePreparation = resolve; }));
    const harness = createPhotoPreparationHarness(prepareGrowthPhoto);
    const pending = harness.prepareWallpaperEditorPhoto("calendar", { name: "large.jpg" }, 1);

    harness.invalidateWallpaperPhotoSelection();
    resolvePreparation({ name: "prepared.jpg" });

    expect(await pending).toBe(false);
    expect(harness.openWallpaperEditor).not.toHaveBeenCalled();
  });
});
