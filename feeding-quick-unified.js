(() => {
  const grid = document.querySelector("#quickPresetGrid");
  if (!grid || grid.dataset.feedingQuickUnified === "true") return;

  // adaptive-feeding.js already renders direct-feeding choices with the same
  // data-preset-index contract as diaper choices. Keep that markup intact so
  // the shared quick-record click handler saves a selected card immediately.
  grid.dataset.feedingQuickUnified = "true";
})();
