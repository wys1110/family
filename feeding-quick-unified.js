(() => {
  const dialog = document.querySelector("#quickLogDialog");
  const grid = document.querySelector("#quickPresetGrid");
  if (!dialog || !grid || grid.dataset.feedingQuickUnified === "true") return;

  grid.dataset.feedingQuickUnified = "true";
  let directPresetIndex = 0;
  let rendering = false;
  let syncQueued = false;

  const directTabActive = () => document.querySelector('[data-feeding-source="breast"]')?.classList.contains("active");
  const directPresets = () => {
    try {
      return Array.isArray(activeQuickPresets)
        ? activeQuickPresets.filter((preset) => preset?.feedingType === "모유" && Number(preset?.feedingMinutes) > 0)
        : [];
    } catch {
      return [];
    }
  };
  const markFor = (preset) => preset.feedingSide === "왼쪽" ? "L" : preset.feedingSide === "오른쪽" ? "R" : "LR";
  const subtitleFor = (preset) => preset.feedingSide === "양쪽" ? "좌우 함께" : `${preset.feedingSide || "직수"} 수유`;

  function selectDirectPreset(index) {
    const presets = directPresets();
    if (!presets.length) return;
    directPresetIndex = Math.max(0, Math.min(presets.length - 1, Number(index) || 0));

    grid.querySelectorAll("[data-direct-preset]").forEach((button) => {
      const selected = Number(button.dataset.directPreset) === directPresetIndex;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    const saveButton = grid.querySelector("#feedingQuickSave");
    const saveLabel = grid.querySelector("#feedingQuickSaveLabel");
    if (saveButton) saveButton.dataset.presetIndex = String(directPresetIndex);
    if (saveLabel) saveLabel.textContent = `${presets[directPresetIndex].label} 기록하기`;
  }

  function renderDirectUnified() {
    if (rendering || !directTabActive()) return;
    const presets = directPresets();
    if (!presets.length) return;

    const alreadyUnified = grid.querySelector(".feeding-direct-selector") && grid.querySelector("#feedingQuickSave");
    if (alreadyUnified) {
      selectDirectPreset(directPresetIndex);
      return;
    }

    rendering = true;
    directPresetIndex = Math.min(directPresetIndex, presets.length - 1);
    grid.classList.add("direct-feeding", "feeding-unified-layout");
    grid.classList.remove("bottle-feeding");
    grid.innerHTML = `
      <div class="feeding-direct-selector" role="group" aria-label="직수 방향과 시간 선택">
        ${presets.map((preset, index) => `
          <button type="button" class="feeding-direct-option" data-direct-preset="${index}" aria-pressed="${index === directPresetIndex}">
            <span class="feeding-direct-mark" aria-hidden="true">${markFor(preset)}</span>
            <span class="feeding-direct-copy"><strong>${escapeHtml(preset.label)}</strong><small>${escapeHtml(subtitleFor(preset))}</small></span>
            <span class="feeding-direct-check" aria-hidden="true">✓</span>
          </button>`).join("")}
      </div>
      <button type="button" id="feedingQuickSave" class="feeding-save-button breast" data-preset-index="${directPresetIndex}">
        <span><strong id="feedingQuickSaveLabel">${escapeHtml(presets[directPresetIndex].label)} 기록하기</strong><small>현재 시간으로 바로 저장</small></span>
      </button>`;
    rendering = false;
    selectDirectPreset(directPresetIndex);
  }

  function syncLayout() {
    syncQueued = false;
    if (!dialog.classList.contains("feeding-quick-active")) return;
    if (directTabActive()) renderDirectUnified();
    else grid.classList.remove("feeding-unified-layout");
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(syncLayout);
  }

  grid.addEventListener("click", (event) => {
    const option = event.target.closest("[data-direct-preset]");
    if (!option || !grid.contains(option)) return;
    event.preventDefault();
    selectDirectPreset(option.dataset.directPreset);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-feeding-source]")) return;
    requestAnimationFrame(queueSync);
  }, true);

  dialog.addEventListener("close", () => {
    directPresetIndex = 0;
    grid.classList.remove("feeding-unified-layout");
  });

  new MutationObserver(queueSync).observe(grid, { childList: true });
  queueSync();
})();
