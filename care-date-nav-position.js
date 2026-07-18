(() => {
  const placeDateNavigationAboveTimeline = () => {
    const dateNavigation = document.getElementById("carePatternDateNav");
    const timeline = document.getElementById("carePatternContent");
    if (!dateNavigation || !timeline || dateNavigation.nextElementSibling === timeline) return;

    timeline.parentElement?.insertBefore(dateNavigation, timeline);
  };

  placeDateNavigationAboveTimeline();
  requestAnimationFrame(placeDateNavigationAboveTimeline);
})();
