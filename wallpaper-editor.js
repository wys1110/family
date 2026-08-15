(function installWallpaperEditor(window) {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
  const normalizeCrop = (value = {}) => ({
    positionX: clamp(value.positionX ?? value.position_x ?? 50, 0, 100),
    positionY: clamp(value.positionY ?? value.position_y ?? 50, 0, 100),
    zoom: clamp(value.zoom ?? 1, 1, 3),
  });

  const dragCrop = (value, dx, dy, width, height) => {
    const crop = normalizeCrop(value);
    if (!(width > 0) || !(height > 0)) return crop;
    return normalizeCrop({
      positionX: crop.positionX - (dx / width) * 100 / crop.zoom,
      positionY: crop.positionY - (dy / height) * 100 / crop.zoom,
      zoom: crop.zoom,
    });
  };

  const pinchZoom = (startZoom, startDistance, currentDistance) =>
    Number(clamp(startZoom * (currentDistance / Math.max(1, startDistance)), 1, 3).toFixed(12));

  const cropStyle = (value) => {
    const crop = normalizeCrop(value);
    return {
      objectPosition: `${crop.positionX}% ${crop.positionY}%`,
      transform: `scale(${crop.zoom})`,
      transformOrigin: `${crop.positionX}% ${crop.positionY}%`,
    };
  };

  function createController(options) {
    const {
      dialog,
      preview,
      zoomInput,
      zoomOutput,
      onSave,
      onChoosePhoto,
    } = options;
    const find = (selector) => dialog.querySelector?.(selector);
    const previewImage = preview.querySelector?.("img") || preview;
    const chooseButton = options.chooseButton || find("#wallpaperEditorChoose");
    const resetButton = options.resetButton || find("#wallpaperEditorReset");
    const cancelButton = options.cancelButton || find("#wallpaperEditorCancel");
    const applyButton = options.applyButton || find("#wallpaperEditorApply");
    const positionXInput = options.positionXInput || find("#wallpaperEditorPositionX");
    const positionYInput = options.positionYInput || find("#wallpaperEditorPositionY");
    const positionXOutput = options.positionXOutput || find("#wallpaperEditorPositionXValue");
    const positionYOutput = options.positionYOutput || find("#wallpaperEditorPositionYValue");
    const previewStatus = options.previewStatus || find("#wallpaperEditorPreviewStatus");
    const closeButtons = options.closeButtons || Array.from(dialog.querySelectorAll?.('[data-close="wallpaperEditorDialog"]') || []);
    const pointers = new Map();
    let draft = { surface: "calendar", url: "", file: undefined, ...normalizeCrop() };
    let objectUrl = "";
    let pinchStart = null;
    let saveInFlight = false;
    let editGeneration = 0;
    let previewReady = true;
    let previewSource = "";

    const pointerDistance = () => {
      const [first, second] = [...pointers.values()];
      return Math.hypot(second.x - first.x, second.y - first.y);
    };

    const releaseObjectUrl = () => {
      if (!objectUrl) return;
      window.URL?.revokeObjectURL?.(objectUrl);
      objectUrl = "";
    };

    const render = () => {
      const style = cropStyle(draft);
      Object.assign(previewImage.style, style);
      zoomInput.value = String(draft.zoom);
      zoomOutput.value = draft.zoom.toFixed(2);
      zoomOutput.textContent = `${draft.zoom.toFixed(2)}×`;
      positionXInput.value = String(draft.positionX);
      positionYInput.value = String(draft.positionY);
      positionXOutput.value = draft.positionX;
      positionYOutput.value = draft.positionY;
      positionXOutput.textContent = `${Math.round(draft.positionX)}%`;
      positionYOutput.textContent = `${Math.round(draft.positionY)}%`;
      preview.dataset.surface = draft.surface;
      dialog.dataset.surface = draft.surface;
    };

    const syncApplyAvailability = () => {
      const disabled = saveInFlight || !previewReady;
      applyButton.disabled = disabled;
      applyButton.setAttribute("aria-disabled", String(disabled));
    };

    const setPreviewStatus = (message = "") => {
      previewStatus.textContent = message;
      previewStatus.hidden = !message;
    };

    const setPreviewReadiness = (generation, ready) => {
      if (generation !== editGeneration) return;
      previewReady = ready;
      setPreviewStatus(ready ? "" : "이 사진을 표시할 수 없어요. 다른 사진을 선택해 주세요.");
      syncApplyAvailability();
    };

    const decodeNewPreview = (generation) => {
      if (!draft.file || typeof previewImage.decode !== "function") return;
      let decoding;
      try {
        decoding = previewImage.decode();
      } catch {
        setPreviewReadiness(generation, false);
        return;
      }
      Promise.resolve(decoding)
        .then(() => setPreviewReadiness(generation, true))
        .catch(() => setPreviewReadiness(generation, false));
    };

    const close = (force = false) => {
      if (saveInFlight && !force) return false;
      if (dialog.open) dialog.close();
      return true;
    };

    const setSaving = (saving) => {
      saveInFlight = saving;
      for (const control of [cancelButton, ...closeButtons, chooseButton, resetButton, zoomInput, positionXInput, positionYInput]) {
        control.disabled = saving;
      }
      syncApplyAvailability();
      applyButton.setAttribute("aria-busy", String(saving));
    };

    zoomInput.addEventListener("input", () => {
      if (saveInFlight) return;
      draft = { ...draft, zoom: normalizeCrop({ ...draft, zoom: zoomInput.value }).zoom };
      render();
    });
    positionXInput.addEventListener("input", () => {
      if (saveInFlight) return;
      draft = { ...draft, ...normalizeCrop({ ...draft, positionX: positionXInput.value }) };
      render();
    });
    positionYInput.addEventListener("input", () => {
      if (saveInFlight) return;
      draft = { ...draft, ...normalizeCrop({ ...draft, positionY: positionYInput.value }) };
      render();
    });

    previewImage.addEventListener("load", () => {
      if (previewImage.src !== previewSource || (draft.file && typeof previewImage.decode === "function")) return;
      setPreviewReadiness(editGeneration, true);
    });
    previewImage.addEventListener("error", () => {
      if (previewImage.src !== previewSource || (draft.file && typeof previewImage.decode === "function")) return;
      setPreviewReadiness(editGeneration, false);
    });

    preview.addEventListener("pointerdown", (event) => {
      if (saveInFlight) return;
      event.preventDefault();
      preview.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        pinchStart = { zoom: draft.zoom, distance: pointerDistance() };
      }
    });

    preview.addEventListener("pointermove", (event) => {
      if (saveInFlight) return;
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      event.preventDefault();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        pinchStart ||= { zoom: draft.zoom, distance: pointerDistance() };
        draft = {
          ...draft,
          zoom: pinchZoom(pinchStart.zoom, pinchStart.distance, pointerDistance()),
        };
      } else if (pointers.size === 1) {
        const bounds = preview.getBoundingClientRect();
        draft = {
          ...draft,
          ...dragCrop(draft, event.clientX - previous.x, event.clientY - previous.y, bounds.width, bounds.height),
        };
      }
      render();
    });

    const endPointer = (event) => {
      if (!pointers.delete(event.pointerId)) return;
      preview.releasePointerCapture?.(event.pointerId);
      pinchStart = null;
    };
    preview.addEventListener("pointerup", endPointer);
    preview.addEventListener("pointercancel", endPointer);

    chooseButton.addEventListener("click", () => {
      if (!saveInFlight) onChoosePhoto(draft.surface);
    });
    resetButton.addEventListener("click", () => {
      if (saveInFlight) return;
      draft = { ...draft, ...normalizeCrop() };
      render();
    });
    cancelButton.addEventListener("click", () => close());
    closeButtons.forEach((button) => button.addEventListener("click", (event) => {
      if (!saveInFlight) return;
      event.preventDefault();
      event.stopPropagation();
    }));
    dialog.addEventListener("cancel", (event) => {
      if (saveInFlight) event.preventDefault();
    });
    applyButton.addEventListener("click", async () => {
      if (saveInFlight || !previewReady) return;
      const saveGeneration = editGeneration;
      setSaving(true);
      try {
        const saved = await onSave({
          surface: draft.surface,
          file: draft.file,
          ...normalizeCrop(draft),
        });
        if (saved !== false && saveGeneration === editGeneration) close(true);
      } finally {
        setSaving(false);
      }
    });
    dialog.addEventListener("close", () => {
      editGeneration += 1;
      pointers.clear();
      pinchStart = null;
      releaseObjectUrl();
    });

    return {
      open(value = {}) {
        if (saveInFlight) return false;
        editGeneration += 1;
        releaseObjectUrl();
        draft = {
          surface: value.surface || "calendar",
          url: value.url || "",
          file: value.file,
          ...normalizeCrop(value),
        };
        if (draft.file && window.URL?.createObjectURL) {
          objectUrl = window.URL.createObjectURL(draft.file);
        }
        previewReady = !draft.file;
        setPreviewStatus(draft.file ? "사진을 확인하는 중이에요…" : "");
        previewImage.src = objectUrl || draft.url;
        previewSource = previewImage.src;
        render();
        syncApplyAvailability();
        decodeNewPreview(editGeneration);
        if (!dialog.open) dialog.showModal();
        return true;
      },
    };
  }

  window.FAMILY_WALLPAPER_EDITOR = {
    normalizeCrop,
    cropStyle,
    dragCrop,
    pinchZoom,
    createController,
  };
})(window);
