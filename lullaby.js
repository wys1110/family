(() => {
  const tracks = [
    { id: "rustle", label: "바스락선생", src: "assets/buseureok.m4a?v=2" },
    { id: "rain", label: "잔잔한 빗소리", src: "assets/lullaby-rain.m4a" },
    { id: "waves", label: "파도 소리", src: "assets/lullaby-waves.m4a" },
  ];
  const storageKey = window.FAMILY_DEMO?.storageKey("family-lullaby-track-v1");
  let selected = tracks[0];
  try {
    const saved = storageKey && localStorage.getItem(storageKey);
    selected = tracks.find(track => track.id === saved) || selected;
  } catch { /* Keep the default if device storage is unavailable. */ }

  const audio = new Audio();
  audio.id = "lullabyAudio";
  audio.controls = true;
  audio.loop = true;
  audio.preload = "none";
  audio.style.maxWidth = "100%";

  let open = false;
  let requested = false;
  let interrupted = false;
  let retryTimer;
  let retryDelay = 1000;
  let attempt = 0;
  const session = navigator.audioSession;

  function setSessionType(type) {
    if (!session || session.type === type) return;
    try { session.type = type; } catch { /* The media element can still play without session hints. */ }
  }

  function render() {
    const playing = open && !audio.paused;
    audio.setAttribute("aria-label", selected.label + " 자장가");
    const panel = document.querySelector("#lullabyPanel");
    if (panel) {
      panel.hidden = !open;
      document.querySelector("#lullabyStatus").textContent = playing ? "연속 반복" : requested ? "재생 대기 중" : "";
      const button = document.querySelector("#lullabyToggle");
      button.textContent = requested ? "자장가 정지" : "자장가 재생";
      button.setAttribute("aria-label", selected.label + (requested ? " 정지" : " 재생"));
      button.setAttribute("aria-expanded", String(open));
      document.querySelector("#lullabyTrack").value = selected.id;
    }
    audio.hidden = !open;
    window.dispatchEvent(new CustomEvent("family:lullaby-playback", {
      detail: { playing, requested, label: selected.label, id: selected.id },
    }));
  }

  function attach() {
    const slot = document.querySelector("#lullabyPlayerSlot");
    if (slot && audio.parentNode !== slot) slot.append(audio);
    const picker = document.querySelector("#lullabyTrack");
    if (picker && !picker.options.length) {
      for (const track of tracks) picker.add(new Option(track.label, track.id));
    }
    render();
  }

  function stop() {
    if (!open) return;
    open = false;
    requested = false;
    interrupted = false;
    clearTimeout(retryTimer);
    retryDelay = 1000;
    attempt++;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (session?.type === "playback") setSessionType("auto");
    render();
  }

  function retryNetwork() {
    clearTimeout(retryTimer);
    if (!requested || navigator.onLine === false) return;
    const current = attempt;
    retryTimer = setTimeout(() => {
      if (!requested || current !== attempt) return;
      audio.load();
      play();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  }

  function reportError() {
    if (!open || !audio.error) return;
    if (audio.error.code === 2 || navigator.onLine === false) {
      retryNetwork();
      render();
      return;
    }
    stop();
    window.toast?.("자장가를 불러오지 못했어요. 다시 눌러 주세요.");
  }

  async function play() {
    const current = ++attempt;
    requested = true;
    clearTimeout(retryTimer);
    setSessionType("playback");
    render();
    try {
      await audio.play();
    } catch {
      if (current !== attempt) return;
      if (session?.state === "interrupted") {
        interrupted = true;
        return;
      }
      if (audio.error?.code === 2 || navigator.onLine === false) {
        retryNetwork();
        return;
      }
      stop();
      window.toast?.("자장가를 재생하지 못했어요. 다시 눌러 주세요.");
    }
  }

  function toggle() {
    if (requested) return stop();
    if (!open) {
      open = true;
      window.dispatchEvent(new Event("family:lullaby-start"));
      audio.src = selected.src;
    }
    return play();
  }

  function select(id, { playNow = false } = {}) {
    const track = tracks.find(item => item.id === id);
    if (!track) return;
    const wasPlaying = requested;
    if (track !== selected) {
      selected = track;
      try { if (storageKey) localStorage.setItem(storageKey, track.id); } catch { /* Remember for this session. */ }
      if (open) {
        attempt++;
        audio.src = track.src;
        if (wasPlaying) return play();
      }
    }
    if (playNow && !wasPlaying) return toggle();
    render();
  }

  audio.addEventListener("playing", () => {
    if (!open || audio.paused) return;
    requested = true;
    setSessionType("playback");
    retryDelay = 1000;
    render();
  });
  audio.addEventListener("pause", () => {
    if (!audio.paused) return;
    if (!audio.ended && !audio.error && !interrupted && session?.state !== "interrupted") {
      requested = false;
      attempt++;
      clearTimeout(retryTimer);
      setSessionType("auto");
    }
    render();
  });
  // Native looping normally skips ended. Some media engines instead stop at the boundary.
  audio.addEventListener("ended", () => {
    if (!requested || !audio.ended) return;
    audio.currentTime = 0;
    play();
  });
  audio.addEventListener("error", reportError);
  window.addEventListener("online", () => {
    if (requested && audio.error) retryNetwork();
  });
  session?.addEventListener("statechange", () => {
    if (session.state === "interrupted") {
      interrupted = requested;
    } else if (interrupted) {
      interrupted = false;
      if (requested && audio.paused) play();
    }
  });
  window.FAMILY_LULLABY = {
    tracks, get selected() { return selected.id; }, get active() { return requested; }, select, attach, toggle, stop,
  };
  if (document.querySelector("#lullabyPlayerSlot")) attach();
})();
