(() => {
  const root = document.documentElement;
  if (root.dataset.tabInteractionFix === "ready") return;
  root.dataset.tabInteractionFix = "ready";

  const navigation = document.querySelector(".view-tabs");
  if (!navigation) return;

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
