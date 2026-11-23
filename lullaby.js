(() => {
  const audio = new Audio();
  audio.id = "lullabyAudio";
  audio.setAttribute("aria-label", "부스럭선생 자장가");
  audio.controls = true;
  audio.loop = true;
  audio.preload = "none";
  audio.style.maxWidth = "100%";

  let open = false;
  let attempt = 0;

  function render() {
    const panel = document.querySelector("#lullabyPanel");
    if (panel) {
      panel.hidden = !open;
      document.querySelector("#lullabyStatus").textContent = open ? "연속 반복" : "";
      document.querySelector("#lullabyToggle").setAttribute("aria-expanded", String(open));
    }
    audio.hidden = !open;
    window.dispatchEvent(new CustomEvent("family:lullaby-playback", {
      detail: { playing: open && !audio.paused },
    }));
  }

  function attach() {
    const slot = document.querySelector("#lullabyPlayerSlot");
    if (slot) slot.append(audio);
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

  async function toggle() {
    if (open && !audio.paused) return stop();
    if (!open) {
      open = true;
      window.dispatchEvent(new Event("family:lullaby-start"));
      audio.src = "assets/buseureok.m4a";
    }
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

  audio.addEventListener("play", render);
  audio.addEventListener("pause", render);
  audio.addEventListener("error", reportError);
  window.FAMILY_LULLABY = { attach, toggle, stop };
  if (document.querySelector("#lullabyPlayerSlot")) attach();
})();
