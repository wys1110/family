(() => {
  const insightRow = document.querySelector("#growthInsightRow");
  if (!insightRow || document.documentElement.dataset.growthInlineIconCleanupBound === "true") return;

  document.documentElement.dataset.growthInlineIconCleanupBound = "true";

  const icons = {
    add: "🌱",
    edit: "✏️",
  };

  let syncQueued = false;

  const syncIcons = () => {
    syncQueued = false;

    insightRow.querySelectorAll("[data-growth-inline-action]").forEach((button) => {
      const action = button.dataset.growthInlineAction;
      const emoji = icons[action];
      if (!emoji) return;

      let icon = Array.from(button.children).find((child) => child.tagName === "SPAN");
      if (!icon) {
        icon = document.createElement("span");
        button.prepend(icon);
      }

      icon.classList.add("growth-inline-action-icon");
      icon.setAttribute("aria-hidden", "true");
      if (icon.textContent !== emoji) icon.textContent = emoji;
    });
  };

  const queueSync = () => {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(syncIcons);
  };

  new MutationObserver(queueSync).observe(insightRow, { childList: true, subtree: true });
  syncIcons();
})();
