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
      for (const listener of listeners.get(type) || []) {
        listener({ preventDefault() {}, ...event, currentTarget: this });
      }
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
    expect(app).toMatch(/await window\.FAMILY_MODULES_READY;\s+initializeWallpaperEditor\(\);/s);
  });

  test("keeps the app usable when the editor module fails to load", () => {
    expect(app.match(/if \(!window\.FAMILY_WALLPAPER_EDITOR\) return;/g)).toHaveLength(2);
    expect(app).toContain("if (!wallpaperEditorController) return;");
  });
});
