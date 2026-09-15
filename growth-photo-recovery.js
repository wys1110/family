(() => {
  const PHOTO_URL_TTL_SECONDS = 6 * 60 * 60;
  const PHOTO_REFRESH_AFTER_MS = 45 * 60 * 1000;
  let photoUrlsIssuedAt = 0;
  let refreshPromise = null;
  let lastForcedRefreshAt = 0;

  const validSignedUrl = (item) => item && !item.error && typeof item.signedUrl === "string" && item.signedUrl.length > 0;

  const urlCache = new Map();
  let cacheScope = "";
  hydrateGrowthPhotoUrls = async function hydrateGrowthPhotoUrlsWithRefresh(entries) {
    const paths = [...new Set(entries.flatMap(entry => entry.photoPaths || []))];
    const supabase = state.supabase, userId = state.session?.user?.id, householdId = state.household?.id;
    const scope = `${userId}|${householdId}`;
    if (scope !== cacheScope) { urlCache.clear(); cacheScope = scope; }
    const current = () => state.supabase === supabase && state.session?.user?.id === userId && state.household?.id === householdId;
    if (!supabase || !paths.length) { photoUrlsIssuedAt = Date.now(); return; }
    const missing = paths.filter(path => !urlCache.has(path) || Date.now() - urlCache.get(path).at >= PHOTO_REFRESH_AFTER_MS);
    const received = new Map();
    for (let offset = 0; offset < missing.length; offset += 100) {
      if (!current()) return;
      const { data, error } = await window.FAMILY_AUTH_API.withRecovery(() => supabase.storage
        .from(GROWTH_PHOTO_BUCKET).createSignedUrls(missing.slice(offset, offset + 100), PHOTO_URL_TTL_SECONDS),
        { supabase, userId, isCurrent: current });
      if (!current()) return;
      if (error) throw error;
      for (const item of (data || []).filter(validSignedUrl)) received.set(item.path, {url:item.signedUrl, at:Date.now()});
    }
    if (!current()) return;
    received.forEach((value,key) => urlCache.set(key,value));
    entries.forEach(entry => { entry.photoUrls = (entry.photoPaths || []).map(path => urlCache.get(path)?.url || ""); });
    photoUrlsIssuedAt = Date.now();
  };

  async function refreshGrowthPhotoUrls(force = false) {
    if (!state.supabase || !state.session || !state.growthEntries.length) return;
    if (!force && Date.now() - photoUrlsIssuedAt < PHOTO_REFRESH_AFTER_MS) return;
    if (refreshPromise) return refreshPromise;

    if (force) urlCache.clear();
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
  window.setTimeout(() => refreshGrowthPhotoUrls(), 2500);
})();
