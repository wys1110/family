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
    const pointers = new Map();
    let draft = { surface: "calendar", url: "", file: undefined, ...normalizeCrop() };
    let objectUrl = "";
    let pinchStart = null;

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
      preview.dataset.surface = draft.surface;
      dialog.dataset.surface = draft.surface;
    };

    const close = () => {
      if (dialog.open) dialog.close();
    };

    zoomInput.addEventListener("input", () => {
      draft = { ...draft, zoom: normalizeCrop({ ...draft, zoom: zoomInput.value }).zoom };
      render();
    });

    preview.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      preview.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        pinchStart = { zoom: draft.zoom, distance: pointerDistance() };
      }
    });

    preview.addEventListener("pointermove", (event) => {
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

    chooseButton.addEventListener("click", () => onChoosePhoto(draft.surface));
    resetButton.addEventListener("click", () => {
      draft = { ...draft, ...normalizeCrop() };
      render();
    });
    cancelButton.addEventListener("click", close);
    applyButton.addEventListener("click", async () => {
      await onSave({
        surface: draft.surface,
        file: draft.file,
        ...normalizeCrop(draft),
      });
      close();
    });
    dialog.addEventListener("close", () => {
      pointers.clear();
      pinchStart = null;
      releaseObjectUrl();
    });

    return {
      open(value = {}) {
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
        previewImage.src = objectUrl || draft.url;
        render();
        if (!dialog.open) dialog.showModal();
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
