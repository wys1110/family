(() => {
  if (window.__familyPhotoViewerNavigationInstalled) return;
  window.__familyPhotoViewerNavigationInstalled = true;

  const MIN_DISTANCE = 46;
  const SWIPE_RATIO = 0.16;
  const FLING_VELOCITY = 0.42;
  const EASING = "cubic-bezier(.22,.72,.16,1)";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const dialog = document.querySelector("#photoViewerDialog");
  const panel = dialog?.querySelector(".photo-viewer-panel");
  const figure = panel?.querySelector("figure");
  const image = document.querySelector("#photoViewerImage");
  if (!dialog || !panel || !figure || !image || typeof openRecentPhoto !== "function") return;

  const stage = document.createElement("div");
  stage.className = "photo-viewer-stage";
  figure.insertBefore(stage, image);
  stage.appendChild(image);

  const previousButton = document.createElement("button");
  previousButton.className = "photo-viewer-nav photo-viewer-prev";
  previousButton.type = "button";
  previousButton.setAttribute("aria-label", "이전 사진");
  previousButton.innerHTML = '<span aria-hidden="true">‹</span>';

  const nextButton = document.createElement("button");
  nextButton.className = "photo-viewer-nav photo-viewer-next";
  nextButton.type = "button";
  nextButton.setAttribute("aria-label", "다음 사진");
  nextButton.innerHTML = '<span aria-hidden="true">›</span>';

  const position = document.createElement("span");
  position.className = "photo-viewer-position";
  position.setAttribute("aria-live", "polite");

  stage.append(previousButton, nextButton, position);

  let gesture = null;
  let navigationSequence = 0;

  function photoItems() {
    return Array.isArray(activePhotoViewerItems) ? activePhotoViewerItems : [];
  }

  function canMove(delta) {
    const nextIndex = activeRecentPhotoIndex + delta;
    return nextIndex >= 0 && nextIndex < photoItems().length;
  }

  function updateControls() {
    const items = photoItems();
    const hasMultiple = items.length > 1;
    previousButton.hidden = !hasMultiple;
    nextButton.hidden = !hasMultiple;
    position.hidden = !items.length;
    previousButton.disabled = !canMove(-1);
    nextButton.disabled = !canMove(1);
    position.textContent = items.length ? `${activeRecentPhotoIndex + 1} / ${items.length}` : "";
  }

  function primePhoto(photo) {
    if (!photo) return;
    photo.filePromise ||= fetch(photo.url)
      .then((response) => {
        if (!response.ok) throw new Error("photo fetch failed");
        return response.blob();
      })
      .catch(() => null);
  }

  function preloadAdjacent() {
    [-1, 1].forEach((delta) => {
      const photo = photoItems()[activeRecentPhotoIndex + delta];
      if (!photo?.url) return;
      const loader = new Image();
      loader.src = photo.url;
    });
  }

  function clearDragStyle() {
    stage.classList.remove("is-dragging");
    image.style.removeProperty("transform");
    image.style.removeProperty("opacity");
  }

  function animateIncoming(direction) {
    clearDragStyle();
    if (reduceMotion.matches || typeof image.animate !== "function") return;
    image.animate(
      [
        { transform: `translate3d(${direction * 34}px,0,0) scale(.985)`, opacity: 0.35 },
        { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
      ],
      { duration: 230, easing: EASING },
    );
  }

  function showPhoto(index, direction) {
    const photo = photoItems()[index];
    if (!photo) return;

    activeRecentPhotoIndex = index;
    navigationSequence += 1;
    const sequence = navigationSequence;

    image.src = photo.url;
    image.alt = `${photo.entry.title} 사진`;
    document.querySelector("#photoViewerTitle").textContent = photo.entry.title;
    document.querySelector("#photoViewerMeta").textContent = `${photo.entry.date.replaceAll("-", ".")} · ${activeBaby()?.name || "아기"} 성장일기`;
    primePhoto(photo);
    updateControls();
    preloadAdjacent();

    const animate = () => {
      if (sequence === navigationSequence) animateIncoming(direction);
    };
    if (image.complete) requestAnimationFrame(animate);
    else image.addEventListener("load", animate, { once: true });
  }

  function movePhoto(delta) {
    if (!canMove(delta)) {
      if (!reduceMotion.matches && typeof stage.animate === "function") {
        stage.animate(
          [
            { transform: "translateX(0)" },
            { transform: `translateX(${delta * 7}px)` },
            { transform: "translateX(0)" },
          ],
          { duration: 170, easing: "ease-out" },
        );
      }
      return;
    }
    showPhoto(activeRecentPhotoIndex + delta, delta);
  }

  function snapBack() {
    const currentTransform = getComputedStyle(image).transform;
    clearDragStyle();
    if (reduceMotion.matches || typeof image.animate !== "function") return;
    image.animate(
      [
        { transform: currentTransform === "none" ? "translate3d(0,0,0)" : currentTransform, opacity: 0.82 },
        { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
      ],
      { duration: 190, easing: EASING },
    );
  }

  function beginSwipe(event) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastAt: performance.now(),
      velocityX: 0,
      displayX: 0,
      axis: null,
    };
  }

  function moveSwipe(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (!gesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return;
      gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.08 ? "x" : "y";
      if (gesture.axis === "y") {
        gesture = null;
        return;
      }
      stage.classList.add("is-dragging");
      stage.setPointerCapture?.(event.pointerId);
    }

    if (gesture.axis !== "x") return;
    event.preventDefault();

    const width = Math.max(stage.clientWidth, 1);
    const movingToUnavailableSide = (dx > 0 && !canMove(-1)) || (dx < 0 && !canMove(1));
    const resistance = movingToUnavailableSide ? 0.18 : 0.72;
    const limit = width * 0.62;
    const rawDisplayX = dx * resistance;
    const displayX = Math.sign(rawDisplayX) * Math.min(Math.abs(rawDisplayX), limit);
    gesture.displayX = displayX;
    image.style.transform = `translate3d(${displayX}px,0,0) scale(.99)`;
    image.style.opacity = String(Math.max(0.58, 1 - Math.abs(displayX) / width * 0.5));

    const now = performance.now();
    const elapsed = now - gesture.lastAt;
    if (elapsed >= 12) {
      gesture.velocityX = (event.clientX - gesture.lastX) / elapsed;
      gesture.lastX = event.clientX;
      gesture.lastAt = now;
    }
  }

  function finishSwipe(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const current = gesture;
    gesture = null;

    if (current.axis !== "x") {
      clearDragStyle();
      return;
    }

    const dx = event.clientX - current.startX;
    const width = Math.max(stage.clientWidth, 1);
    const threshold = Math.max(MIN_DISTANCE, width * SWIPE_RATIO);
    const shouldMove = Math.abs(dx) >= threshold || Math.abs(current.velocityX) >= FLING_VELOCITY;
    const delta = dx < 0 ? 1 : -1;

    if (shouldMove && canMove(delta)) {
      clearDragStyle();
      movePhoto(delta);
    } else {
      snapBack();
    }
  }

  function cancelSwipe(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture = null;
    snapBack();
  }

  const originalOpenRecentPhoto = openRecentPhoto;
  openRecentPhoto = function enhancedOpenRecentPhoto(index, items = recentPhotoItems) {
    originalOpenRecentPhoto(index, items);
    updateControls();
    preloadAdjacent();
  };

  previousButton.addEventListener("click", () => movePhoto(-1));
  nextButton.addEventListener("click", () => movePhoto(1));
  stage.addEventListener("pointerdown", beginSwipe);
  stage.addEventListener("pointermove", moveSwipe, { passive: false });
  stage.addEventListener("pointerup", finishSwipe);
  stage.addEventListener("pointercancel", cancelSwipe);
  dialog.addEventListener("close", () => {
    gesture = null;
    clearDragStyle();
  });
  document.addEventListener("keydown", (event) => {
    if (!dialog.open) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      movePhoto(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      movePhoto(1);
    }
  });
})();
