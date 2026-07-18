(() => {
  const PHOTO_URL_TTL_SECONDS = 6 * 60 * 60;
  const PHOTO_REFRESH_AFTER_MS = 45 * 60 * 1000;
  let photoUrlsIssuedAt = 0;
  let refreshPromise = null;
  let lastForcedRefreshAt = 0;

  const validSignedUrl = (item) => item && !item.error && typeof item.signedUrl === "string" && item.signedUrl.length > 0;

  hydrateGrowthPhotoUrls = async function hydrateGrowthPhotoUrlsWithRefresh(entries) {
    const paths = [...new Set(entries.flatMap((entry) => entry.photoPaths || []))];
    if (!state.supabase || !paths.length) {
      entries.forEach((entry) => { entry.photoUrls = []; });
      return;
    }

    const { data, error } = await state.supabase.storage
      .from(GROWTH_PHOTO_BUCKET)
      .createSignedUrls(paths, PHOTO_URL_TTL_SECONDS);

    if (error) throw error;

    const urls = new Map(
      (data || [])
        .filter(validSignedUrl)
        .map((item) => [item.path, item.signedUrl]),
    );

    entries.forEach((entry) => {
      entry.photoUrls = (entry.photoPaths || []).map((path) => urls.get(path) || "");
    });
    photoUrlsIssuedAt = Date.now();
  };

  async function refreshGrowthPhotoUrls(force = false) {
    if (!state.supabase || !state.session || !state.growthEntries.length) return;
    if (!force && Date.now() - photoUrlsIssuedAt < PHOTO_REFRESH_AFTER_MS) return;
    if (refreshPromise) return refreshPromise;

    const entries = state.growthEntries;
    const householdId = state.household?.id;
    refreshPromise = hydrateGrowthPhotoUrls(entries)
      .then(() => {
        if (state.growthEntries === entries && state.household?.id === householdId) renderGrowth();
      })
      .catch((error) => console.warn("성장 사진 주소 갱신 실패", error))
      .finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  function bindPhotoErrorRecovery() {
    document.querySelectorAll("#recentPhotoGrid img, #growthList .growth-thumbnail, #photoAlbumContent img, #photoViewerImage").forEach((image) => {
      if (image.dataset.photoRecoveryBound) return;
      image.dataset.photoRecoveryBound = "true";
      image.addEventListener("error", async () => {
        if (image.dataset.photoRecoveryTried || Date.now() - lastForcedRefreshAt < 10000) {
          image.hidden = true;
          return;
        }
        image.dataset.photoRecoveryTried = "true";
        lastForcedRefreshAt = Date.now();
        await refreshGrowthPhotoUrls(true);
      });
    });
  }

  const baseRenderGrowth = renderGrowth;
  renderGrowth = function renderGrowthWithPhotoRecovery(...args) {
    const result = baseRenderGrowth(...args);
    queueMicrotask(bindPhotoErrorRecovery);
    return result;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshGrowthPhotoUrls();
  });
  window.addEventListener("focus", () => refreshGrowthPhotoUrls());
  window.setInterval(() => {
    if (document.visibilityState === "visible") refreshGrowthPhotoUrls();
  }, PHOTO_REFRESH_AFTER_MS);
  window.setTimeout(() => refreshGrowthPhotoUrls(true), 2500);
})();
