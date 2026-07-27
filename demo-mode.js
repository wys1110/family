(() => {
  const SESSION_KEY = "family-demo-mode-v1";
  const STORAGE_PREFIX = "family-demo-";

  function requestedByUrl() {
    try {
      return new URL(window.location.href).searchParams.get("demo") === "1";
    } catch {
      return false;
    }
  }

  function requestedBySession() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  }

  const active = requestedByUrl() || requestedBySession();
  if (active) {
    try { sessionStorage.setItem(SESSION_KEY, "1"); }
    catch { /* URL의 demo=1만으로도 테스트 모드를 유지할 수 있어요. */ }
  }

  function storageKey(key) {
    if (!active) return key;
    return `${STORAGE_PREFIX}${String(key).replace(/^family-/, "")}`;
  }

  function enter() {
    try { sessionStorage.setItem(SESSION_KEY, "1"); }
    catch { /* URL 파라미터로 진입 */ }
    const target = new URL(window.location.href);
    target.searchParams.set("demo", "1");
    target.searchParams.delete("__refresh");
    window.location.assign(target.href);
  }

  function exit() {
    try { sessionStorage.removeItem(SESSION_KEY); }
    catch { /* URL 파라미터 제거로 종료 */ }
    const target = new URL(window.location.href);
    target.searchParams.delete("demo");
    target.searchParams.delete("__refresh");
    window.location.replace(target.href);
  }

  function reset() {
    try {
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
    } catch { /* 초기화가 막히면 현재 메모리 데이터는 유지 */ }
    window.location.reload();
  }

  window.FAMILY_DEMO_MODE = active;
  window.FAMILY_DEMO = Object.freeze({
    active,
    storageKey,
    enter,
    exit,
    reset,
  });
})();
