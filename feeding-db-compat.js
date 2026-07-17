(() => {
  const DB_BOTTLE_TYPE = "젖병";
  const INVALID_DB_TYPES = new Set(["유축모유", "분유"]);

  function normalizeQuickPreset(event) {
    const button = event.target.closest("[data-preset-index]");
    if (!button || typeof activeQuickPresets === "undefined") return;
    const preset = activeQuickPresets[Number(button.dataset.presetIndex)];
    if (!preset || !INVALID_DB_TYPES.has(preset.feedingType)) return;
    preset.feedingType = DB_BOTTLE_TYPE;
  }

  function normalizeDetailedFeeding() {
    const select = document.querySelector("#growthFeedingType");
    if (!select || !INVALID_DB_TYPES.has(select.value)) return;

    const selectedType = select.value;
    const title = document.querySelector("#growthEntryTitle");
    if (selectedType === "유축모유" && title) {
      const current = title.value.trim();
      if (!current) title.value = "유축모유 수유";
      else if (!current.includes("유축")) title.value = `유축 · ${current}`.slice(0, 60);
    } else if (selectedType === "분유" && title && !title.value.trim()) {
      title.value = "분유 수유";
    }

    select.value = DB_BOTTLE_TYPE;
  }

  function install() {
    const quickGrid = document.querySelector("#quickPresetGrid");
    if (quickGrid && !quickGrid.dataset.feedingDbCompat) {
      quickGrid.dataset.feedingDbCompat = "true";
      quickGrid.addEventListener("click", normalizeQuickPreset, true);
    }

    const form = document.querySelector("#growthForm");
    if (form && !form.dataset.feedingDbCompat) {
      form.dataset.feedingDbCompat = "true";
      form.addEventListener("submit", normalizeDetailedFeeding, true);
    }
  }

  install();
})();