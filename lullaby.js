(() => {
  const audio = new Audio();
  audio.id = "lullabyAudio";
  audio.setAttribute("aria-label", "부스럭선생 자장가");
  audio.controls = true;
  audio.style.maxWidth = "100%";

  // Start this same element during the tap so WebKit can play the decoded track
  // after the network round trip. The WAV contains one silent PCM sample.
  const silence = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==";
  const app = () => typeof state === "undefined" ? null : state;
  const owner = () => app()?.session?.user?.id;
  let request = null;
  let playbackOwner;
  let url = "";
  let status = "";

  function render() {
    const panel = document.querySelector("#lullabyPanel");
    if (panel) {
      panel.hidden = !request;
      document.querySelector("#lullabyStatus").textContent = status;
      document.querySelector("#lullabyToggle").setAttribute("aria-expanded", String(!!request));
    }
    audio.hidden = !url;
    window.dispatchEvent(new CustomEvent("family:lullaby-playback", {
      detail: { playing: !!url && !audio.paused },
    }));
  }

  function attach() {
    const slot = document.querySelector("#lullabyPlayerSlot");
    if (slot) slot.append(audio);
    render();
  }

  function stop() {
    if (!request) return;
    request.abort();
    request = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (url) URL.revokeObjectURL(url);
    url = "";
    render();
  }

  async function toggle() {
    if (request) {
      if (url && audio.paused) {
        await audio.play().catch(() => window.toast?.("자장가를 다시 눌러 주세요."));
        return;
      }
      return stop();
    }
    const active = new AbortController();
    const user = owner();
    playbackOwner = user;
    request = active;
    status = "자장가를 준비하고 있어요.";
    window.dispatchEvent(new Event("family:lullaby-start"));
    render();
    audio.loop = false;
    audio.src = silence;
    audio.play().catch(() => {});
    try {
      const demo = window.FAMILY_DEMO_MODE;
      const pending = demo ? "demo-lullaby-activation" : "lullaby-activation";
      const saved = window.FAMILY_DEMO.storageKey(`family-lullaby-key-v1:${user || "device"}`);
      const activation = sessionStorage.getItem(pending);
      let hex = activation || localStorage.getItem(saved);
      if (!hex && !demo && user) {
        const { data, error } = await app().supabase.from("lullaby_playback")
          .select("playback_key").eq("user_id", user).abortSignal(active.signal).maybeSingle();
        if (error) throw error;
        hex = data?.playback_key;
      }
      if (active.signal.aborted) return;
      if (owner() !== user) return stop();
      if (!hex || !/^[a-f0-9]{64}$/.test(hex)) {
        stop();
        window.toast?.("부스럭 자장가를 등록한 계정으로 로그인해 주세요.");
        return;
      }
      const raw = Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
      const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
      const response = await fetch("assets/buseureok-audio.bin", { signal: active.signal });
      if (!response.ok) throw new Error("Audio download failed");
      const data = new Uint8Array(await response.arrayBuffer());
      const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.subarray(0, 12) }, key, data.subarray(12));
      if (active.signal.aborted) return;
      if (owner() !== user) return stop();
      if (activation) {
        try {
          localStorage.setItem(saved, activation);
          sessionStorage.removeItem(pending);
        } catch { /* Still playable for this session. */ }
      }
      url = URL.createObjectURL(new Blob([bytes], { type: "audio/mp4" }));
      audio.loop = true;
      audio.src = url;
      status = "연속 반복";
      render();
      await audio.play().catch(() => {
        if (!active.signal.aborted) window.toast?.("자장가를 한 번 더 눌러 주세요.");
      });
    } catch {
      if (!active.signal.aborted) {
        stop();
        window.toast?.("자장가를 불러오지 못했어요. 잠시 후 다시 눌러 주세요.");
      }
    }
  }

  audio.addEventListener("play", render);
  audio.addEventListener("pause", render);
  window.addEventListener("familycontextchange", () => {
    if (owner() !== playbackOwner) stop();
  });
  window.FAMILY_LULLABY = { attach, toggle, stop };
  if (document.querySelector("#lullabyPlayerSlot")) attach();
})();
