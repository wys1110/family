(() => {
  const grid = document.querySelector("#quickPresetGrid");
  if (!grid || grid.dataset.feedingStepperFix === "true") return;

  grid.dataset.feedingStepperFix = "true";
  grid.addEventListener("click", (event) => {
    const adjustButton = event.target.closest("[data-feeding-adjust]");
    if (!adjustButton || !grid.contains(adjustButton)) return;

    event.preventDefault();
    const tabs = document.querySelector("#feedingQuickTabs");
    if (!tabs) return;

    const proxy = document.createElement("button");
    proxy.type = "button";
    proxy.hidden = true;
    proxy.dataset.feedingAdjust = adjustButton.dataset.feedingAdjust;
    tabs.appendChild(proxy);
    proxy.click();
    proxy.remove();
  });
})();
