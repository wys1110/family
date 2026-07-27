(() => {
  const grid = document.querySelector("#quickPresetGrid");
  if (!grid || grid.dataset.feedingQuickUnified === "true") return;

  // adaptive-feeding.js keeps the final save action on the shared
  // data-preset-index contract after direction and time adjustment.
  grid.dataset.feedingQuickUnified = "true";
})();
