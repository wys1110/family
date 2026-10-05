(() => {
  const root = document.documentElement;
  if (root.dataset.tabInteractionFix === "ready") return;
  root.dataset.tabInteractionFix = "ready";

  const navigation = document.querySelector(".view-tabs");
  if (!navigation) return;

  const syncTabAccess = () => {
    navigation.querySelectorAll(".view-tab[data-view]").forEach((tab) => {
      const active = tab.classList.contains("active");
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(active));
      tab.setAttribute("aria-controls", `${tab.dataset.view}View`);
      tab.tabIndex = active ? 0 : -1;
    });
  };
  syncTabAccess();
  new MutationObserver(syncTabAccess).observe(navigation, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  navigation.addEventListener("keydown", (event) => {
    const tab = event.target.closest(".view-tab[data-view]");
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...navigation.querySelectorAll(".view-tab[data-view]")].filter((item) => !item.hidden && !item.disabled);
    const index = tabs.indexOf(tab); if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1)
      : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    tabs.forEach((item) => { item.tabIndex = item === next ? 0 : -1; });
    next.focus();
  });

  const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)");
  const tabFromEvent = (event) => {
    const target = event.target;
    return target instanceof Element ? target.closest(".view-tab") : null;
  };

  const releaseTouchFocus = (event) => {
    const tab = tabFromEvent(event);
    if (!tab) return;

    // Wait until the click handler and the wrapped view switchers finish.
    // A second frame also gives iOS Safari a clean paint after the active tab moves.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (document.activeElement === tab) tab.blur();
      });
    });
  };

  navigation.addEventListener("pointerup", (event) => {
    if (!["touch", "pen"].includes(event.pointerType)) return;
    releaseTouchFocus(event);
  }, { passive: true, capture: true });

  // Older iOS releases can omit pointerType on a synthesized click.
  navigation.addEventListener("touchend", releaseTouchFocus, { passive: true, capture: true });
  navigation.addEventListener("click", (event) => {
    if (!coarsePointer.matches || event.detail === 0) return;
    releaseTouchFocus(event);
  }, true);
})();
