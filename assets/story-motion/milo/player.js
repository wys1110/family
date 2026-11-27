(() => {
  "use strict";

  const lines = [
    ["마일로가 양말 한 짝을 찾았어요.", "Milo finds one sock.", "마일로가 파란 줄무늬 양말을 들어 올려요."],
    ["왼발에 양말을 신었어요.", "He puts it on his left foot.", "마일로가 왼발에 파란 줄무늬 양말을 신어요."],
    ["오른발은 아직 차가웠어요.", "His right foot feels cold.", "양말을 신지 않은 오른발이 추워서 떨려요."],
    ["마일로가 바구니 안을 들여다봤어요.", "He looks in the basket.", "마일로가 바구니 안을 살펴봐요."],
    ["짝꿍 양말이 거기 있었어요!", "There is his other sock!", "바구니에서 짝꿍 양말을 찾아 올려요."],
    ["이제 두 발이 모두 따뜻해요.", "Now both feet are warm.", "두 발에 같은 파란 줄무늬 양말을 신었어요."],
    ["마일로가 발가락을 꼼지락거려요.", "Milo wiggles his toes.", "마일로가 양말을 신은 두 발끝을 꼼지락거려요."],
  ];
  const timing = window.storyTiming;
  const canvas = document.querySelector("#scene");
  const ctx = canvas.getContext("2d");
  const cover = document.querySelector("#book-cover");
  const artNotice = document.querySelector("#art-notice");
  let artworkLoaded = false;
  let artworkFailed = false;

  function showCover() {
    artworkLoaded = false;
    artworkFailed = true;
    canvas.hidden = true;
    cover.hidden = false;
    artNotice.hidden = false;
  }

  const voice = document.querySelector("#voice");
  const previous = document.querySelector("#prev");
  const next = document.querySelector("#next");
  const play = document.querySelector("#play");
  const playLabel = document.querySelector("#play-label");
  const playShape = play.querySelector(".play-shape");
  const pauseShape = play.querySelector(".pause-shape");
  const notice = document.querySelector("#notice");
  const caption = document.querySelector(".sentences");
  const pageNum = document.querySelector("#page-num");
  const korean = document.querySelector("#line-ko");
  const english = document.querySelector("#line-en");
  const segments = [...document.querySelectorAll(".position span")];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const still = .65;
  let page = 0;
  let phase = still;
  let frame = 0;
  let playing = false;
  let starting = false;
  let finished = false;
  let manual = true;
  let played = false;
  let selectedTime = null;

  function draw(position) {
    phase = position;
    if (!artworkLoaded || !window.storyRoomImage?.naturalWidth) return;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.parentElement.clientWidth * density));
    const height = Math.round(width * 450 / 720);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.save();
    try {
      ctx.setTransform(width / 720, 0, 0, height / 450, 0, 0);
      window.drawStoryFrame(ctx, page, reduced.matches ? still : position);
      canvas.hidden = false;
      cover.hidden = true;
    } catch {
      showCover();
    } finally {
      ctx.restore();
    }
  }

  function setPage(index) {
    page = index;
    const [ko, en, description] = lines[page];
    pageNum.textContent = String(page + 1);
    korean.textContent = ko;
    english.textContent = en;
    canvas.setAttribute("aria-label", description);
    previous.disabled = page === 0;
    next.disabled = page === lines.length - 1;
    segments.forEach((segment, n) => {
      segment.classList.toggle("passed", n < page);
      segment.classList.toggle("active", n === page);
    });
  }

  function updateButton() {
    caption.setAttribute("aria-live", playing ? "off" : "polite");
    const label = playing || starting ? "잠시 멈춤" : finished ? "다시 듣기" :
      manual && page > 0 ? "이 장부터 듣기" : played && !manual ? "이어서 듣기" : "한국어로 듣기";
    playLabel.textContent = label;
    play.setAttribute("aria-label", label);
    pauseShape.toggleAttribute("hidden", !(playing || starting));
    playShape.toggleAttribute("hidden", playing || starting);
  }

  function timeOnPage() {
    const time = voice.currentTime;
    let index = 0;
    while (index + 1 < lines.length && time >= timing.starts[index + 1]) index++;
    const begin = timing.starts[index];
    const end = timing.starts[index + 1] ?? timing.duration;
    return [index, Math.min(1, Math.max(0, (time - begin) / (end - begin)))];
  }

  function sync() {
    if (manual || finished || !timing) return;
    const [index, progress] = timeOnPage();
    if (index !== page) setPage(index);
    draw(progress);
  }

  function animate() {
    frame = 0;
    if (!playing || document.hidden) return;
    sync();
    if (!reduced.matches && !artworkFailed) frame = requestAnimationFrame(animate);
  }

  function stopFrames() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  function seek(seconds) {
    if (voice.readyState === 0) {
      selectedTime = seconds;
      return;
    }
    selectedTime = null;
    voice.currentTime = seconds;
  }

  function turnTo(index) {
    if (index < 0 || index >= lines.length) return;
    manual = true;
    playing = false;
    starting = false;
    finished = false;
    stopFrames();
    voice.pause();
    notice.textContent = "";
    setPage(index);
    if (timing) seek(timing.starts[index]);
    draw(still);
    updateButton();
  }

  async function toggleVoice() {
    if (playing || starting) {
      voice.pause();
      playing = false;
      starting = false;
      stopFrames();
      updateButton();
      return;
    }
    if (!timing) {
      notice.textContent = "낭독 파일을 불러오지 못했어요. 화살표로 넘겨 읽을 수 있어요.";
      return;
    }
    if (finished) turnTo(0);
    if (voice.error) voice.load();
    if (manual) seek(timing.starts[page]);
    notice.textContent = "";
    manual = false;
    starting = true;
    updateButton();
    try {
      await voice.play();
    } catch (error) {
      if (error.name === "AbortError") return;
      starting = false;
      playing = false;
      notice.textContent = "한국어 낭독을 재생할 수 없어요. 화살표로 넘겨 읽을 수 있어요.";
      updateButton();
    }
  }

  voice.addEventListener("loadedmetadata", () => {
    if (selectedTime !== null) seek(selectedTime);
  });
  voice.addEventListener("playing", () => {
    starting = false;
    playing = true;
    played = true;
    updateButton();
    stopFrames();
    animate();
  });
  voice.addEventListener("pause", () => {
    if (!voice.paused) return;
    starting = false;
    playing = false;
    stopFrames();
    updateButton();
  });
  voice.addEventListener("ended", () => {
    if (manual) return;
    playing = false;
    starting = false;
    finished = true;
    stopFrames();
    setPage(lines.length - 1);
    draw(1);
    updateButton();
  });
  voice.addEventListener("error", () => {
    playing = false;
    starting = false;
    stopFrames();
    notice.textContent = "낭독을 불러오지 못했어요. 화살표로 넘겨 읽을 수 있어요.";
    updateButton();
  });
  voice.addEventListener("timeupdate", () => {
    if (playing && (!frame || reduced.matches)) sync();
  });

  const back = document.querySelector("#back");
  const appRoot = new URL("../../../", location.href);
  const embeddedInApp = /\/assets\/story-motion\/milo\/(?:index\.html)?$/.test(location.pathname);
  let referringApp = null;
  if (document.referrer) {
    const ref = new URL(document.referrer);
    if (ref.origin === location.origin && [appRoot.pathname, appRoot.pathname + "index.html"].includes(ref.pathname)) {
      referringApp = ref;
    }
  }
  if (embeddedInApp) {
    const destination = new URL("index.html", appRoot);
    if (referringApp?.searchParams.get("demo") === "1" || new URLSearchParams(location.search).get("demo") === "1") {
      destination.searchParams.set("demo", "1");
    }
    const canReturnToStory = referringApp && history.length > 1;
    back.href = referringApp?.href ?? destination.href;
    if (canReturnToStory) {
      back.setAttribute("aria-label", "가족 앱 동화로 돌아가기");
      back.querySelector("span").textContent = "동화";
    }
    back.hidden = false;
    back.addEventListener("click", event => {
      if (canReturnToStory && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        history.back();
      }
    });
  }

  window.addEventListener("pagehide", () => {
    voice.pause();
    playing = false;
    starting = false;
    stopFrames();
    updateButton();
  });

  previous.addEventListener("click", () => turnTo(page - 1));
  next.addEventListener("click", () => turnTo(page + 1));
  play.addEventListener("click", toggleVoice);
  document.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    turnTo(page + (event.key === "ArrowRight" ? 1 : -1));
  });
  document.addEventListener("visibilitychange", () => {
    stopFrames();
    if (!document.hidden && playing) animate();
  });
  reduced.addEventListener("change", () => {
    stopFrames();
    if (playing) animate();
    else draw(phase);
  });
  if ("ResizeObserver" in window) new ResizeObserver(() => draw(phase)).observe(canvas.parentElement);
  else window.addEventListener("resize", () => draw(phase));
  window.storyRoomImage = new Image();
  window.storyRoomImage.onload = () => draw(phase);
  window.storyRoomImage.onerror = showCover;
  window.storyRoomImage.src = "room.webp";
  Promise.resolve(window.miloArtworkReady).then(ready => {
    if (!ready || !ctx || typeof window.drawStoryFrame !== "function" || artworkFailed) {
      showCover();
      return;
    }
    artworkLoaded = true;
    draw(phase);
  }, showCover);
  setPage(0);
  draw(still);
  updateButton();
})();
