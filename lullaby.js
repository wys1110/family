(() => {
  const tracks = [
    { id: "rustle", label: "바스락선생", src: "assets/buseureok.m4a" },
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
  let attempt = 0;

  function render() {
    const playing = open && !audio.paused;
    audio.setAttribute("aria-label", selected.label + " 자장가");
    const panel = document.querySelector("#lullabyPanel");
    if (panel) {
      panel.hidden = !open;
      document.querySelector("#lullabyStatus").textContent = open ? "연속 반복" : "";
      const button = document.querySelector("#lullabyToggle");
      button.textContent = playing ? "자장가 정지" : "자장가 재생";
      button.setAttribute("aria-label", selected.label + (playing ? " 정지" : " 재생"));
      button.setAttribute("aria-expanded", String(open));
      document.querySelector("#lullabyTrack").value = selected.id;
    }
    audio.hidden = !open;
    window.dispatchEvent(new CustomEvent("family:lullaby-playback", {
      detail: { playing, label: selected.label, id: selected.id },
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
    attempt++;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    render();
  }

  function reportError() {
    if (!open || !audio.error) return;
    stop();
    window.toast?.("자장가를 불러오지 못했어요. 다시 눌러 주세요.");
  }

  async function play() {
    const current = ++attempt;
    render();
    try {
      await audio.play();
    } catch {
      if (current !== attempt) return;
      stop();
      window.toast?.("자장가를 재생하지 못했어요. 다시 눌러 주세요.");
    }
  }

  function toggle() {
    if (open && !audio.paused) return stop();
    if (!open) {
      open = true;
      window.dispatchEvent(new Event("family:lullaby-start"));
      audio.src = selected.src;
    }
    return play();
  }

  function select(id) {
    const track = tracks.find(item => item.id === id);
    if (!track || track === selected) return;
    selected = track;
    try { if (storageKey) localStorage.setItem(storageKey, track.id); } catch { /* Remember for this session. */ }
    if (open) {
      const resume = !audio.paused;
      attempt++;
      audio.src = track.src;
      if (resume) return play();
    }
    render();
  }

  audio.addEventListener("play", render);
  audio.addEventListener("pause", render);
  audio.addEventListener("error", reportError);
  window.FAMILY_LULLABY = {
    tracks, get selected() { return selected.id; }, select, attach, toggle, stop,
  };
  if (document.querySelector("#lullabyPlayerSlot")) attach();
})();
