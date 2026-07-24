(() => {
  if (document.documentElement.dataset.languageWritingModule === "ready") return;
  document.documentElement.dataset.languageWritingModule = "ready";

  const GOAL = 3;
  const MODE_KEY = "family-language-writing-mode-v1";
  const HISTORY_KEY = "family-language-writing-history-v1";
  const META = {
    english: ["English", "영어", "🇺🇸", "en-US"],
    japanese: ["日本語", "일본어", "🇯🇵", "ja-JP"],
    spanish: ["Español", "스페인어", "🇪🇸", "es-ES"]
  };
  const appState = () => (typeof state !== "undefined" ? state : null);
  const scope = () => appState()?.session?.user?.id || "device";
  const modeKey = () => `${MODE_KEY}:${scope()}`;
  const historyKey = () => `${HISTORY_KEY}:${scope()}`;
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const esc = (v = "") => String(v).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);

  let mode = "speaking";
  let hint = 0;
  let revealed = false;
  let feedback = null;
  let lastPhrase = "";
  let frame = 0;
  let applied = null;

  const read = (key, fallback = {}) => {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { }
  };
  const languageKey = () => document.querySelector("#languageSelector [data-language].active")?.dataset.language || "english";
  const meta = () => META[languageKey()] || META.english;
  const target = () => document.querySelector("#languagePhraseText")?.textContent?.trim() || "";
  const meaning = () => document.querySelector("#languageMeaning")?.textContent?.trim() || "";
  const phraseKey = () => `${languageKey()}:${target()}`;
  const progress = (lang = languageKey()) => read(historyKey())[today()]?.[lang] || {};
  const done = () => Boolean(progress()[phraseKey()]);
  const count = (lang = languageKey()) => Object.values(progress(lang)).filter(Boolean).length;

  function reset(clear = true) {
    hint = 0;
    revealed = false;
    feedback = null;
    if (clear) {
      const input = document.querySelector("#languageWritingInput");
      if (input) input.value = "";
    }
  }

  function createUi() {
    const view = document.querySelector("#languageView");
    const selector = view?.querySelector(".language-selector-card");
    const nav = view?.querySelector(".language-phrase-navigation");
    if (!view || !selector || !nav || document.querySelector("#languageModeSwitch")) return false;

    const switcher = document.createElement("div");
    switcher.id = "languageModeSwitch";
    switcher.className = "language-mode-switch";
    switcher.innerHTML = `
      <button type="button" data-mode="speaking"><span>🗣️</span><strong>말하기</strong><small>듣고 따라 말하기</small></button>
      <button type="button" data-mode="writing"><span>✍️</span><strong>쓰기</strong><small>뜻을 보고 직접 쓰기</small></button>`;
    selector.insertAdjacentElement("afterend", switcher);

    const panel = document.createElement("div");
    panel.id = "languageWritingPanel";
    panel.className = "language-writing-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="language-writing-prompt"><span id="languageWritingFlag">🇺🇸</span><div><p>WRITE THIS IN <strong id="languageWritingLanguage">ENGLISH</strong></p><blockquote id="languageWritingMeaning"></blockquote></div></div>
      <label class="language-writing-field"><span>정답을 직접 입력하세요</span><textarea id="languageWritingInput" rows="3" autocomplete="off" autocorrect="off" spellcheck="false"></textarea></label>
      <div class="language-writing-feedback" id="languageWritingFeedback" hidden></div>
      <div class="language-writing-hint" id="languageWritingHint" hidden></div>
      <div class="language-writing-actions"><button type="button" id="languageWritingCheck">✓ 정답 확인</button><button type="button" id="languageWritingHintButton">💡 힌트</button></div>
      <button class="language-writing-reveal" type="button" id="languageWritingReveal">정답 보기</button>`;
    nav.insertAdjacentElement("beforebegin", panel);

    switcher.addEventListener("click", e => {
      const next = e.target.closest("[data-mode]")?.dataset.mode;
      if (!next || next === mode) return;
      mode = next;
      try { localStorage.setItem(modeKey(), mode); } catch { }
      reset();
      applyMode();
      if (mode === "writing") requestAnimationFrame(() => document.querySelector("#languageWritingInput")?.focus());
    });
    document.querySelector("#languageWritingCheck").addEventListener("click", check);
    document.querySelector("#languageWritingHintButton").addEventListener("click", showHint);
    document.querySelector("#languageWritingReveal").addEventListener("click", reveal);
    document.querySelector("#languageWritingInput").addEventListener("input", () => {
      if (feedback?.type !== "correct") feedback = null;
      renderWriting();
    });
    return true;
  }

  const speakingNodes = () => [
    "#languagePhraseText", "#languagePronunciation", "#languageMeaning",
    ".language-audio-actions", ".language-shadow-card"
  ].map(s => document.querySelector(s)).filter(Boolean);

  function applyMode() {
    if (!document.querySelector("#languageModeSwitch")) return;
    const changed = applied !== mode;
    applied = mode;
    document.querySelectorAll("#languageModeSwitch [data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    speakingNodes().forEach(n => { n.hidden = mode === "writing"; });
    document.querySelector("#languageWritingPanel").hidden = mode !== "writing";
    if (mode === "writing") {
      renderWriting();
      renderGoal();
    } else if (changed) {
      document.querySelector("#languageSelector [data-language].active")?.click();
    }
  }

  const exact = v => String(v || "").normalize("NFKC").toLocaleLowerCase(meta()[3]).replace(/[¿?¡!.,;:'"“”‘’()\[\]{}…。！？、]/g, "").replace(/\s+/g, " ").trim();
  const loose = v => exact(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  function check() {
    const input = document.querySelector("#languageWritingInput");
    if (!input?.value.trim()) {
      feedback = { type: "empty", title: "문장을 먼저 입력해 주세요", copy: "기억나는 만큼 직접 써보세요." };
    } else if (exact(input.value) === exact(target())) {
      const data = read(historyKey());
      data[today()] ||= {};
      data[today()][languageKey()] ||= {};
      data[today()][languageKey()][phraseKey()] = true;
      save(historyKey(), data);
      revealed = true;
      feedback = { type: "correct", title: "정답이에요! 🎉", copy: target() };
      if (typeof toast === "function") toast("쓰기 연습을 완료했어요 ✍️");
    } else if (loose(input.value) === loose(target())) {
      feedback = { type: "near", title: "거의 맞았어요", copy: "악센트나 문장부호를 확인해 보세요." };
    } else {
      feedback = { type: "wrong", title: "조금 달라요", copy: "힌트를 보고 다시 써보세요." };
    }
    renderWriting();
    renderGoal();
  }

  function hintText() {
    const text = target();
    if (languageKey() === "japanese") {
      const chars = Array.from(text);
      const n = Math.max(1, Math.ceil(chars.length * (hint === 1 ? .25 : .5)));
      return chars.map((c, i) => i < n || /[\s？?。！!]/.test(c) ? c : "＿").join("");
    }
    const words = text.split(/\s+/);
    const n = hint === 1 ? 1 : Math.max(2, Math.ceil(words.length / 2));
    return words.map((w, i) => i < n ? w : "_____").join(" ");
  }

  function showHint() {
    hint = Math.min(2, hint + 1);
    renderWriting();
    document.querySelector("#languageWritingInput")?.focus();
  }

  function reveal() {
    revealed = true;
    feedback = { type: "answer", title: "정답", copy: target() };
    renderWriting();
  }

  function renderWriting() {
    if (mode !== "writing") return;
    const [label, short, flag, locale] = meta();
    document.querySelector("#languageWritingFlag").textContent = flag;
    document.querySelector("#languageWritingLanguage").textContent = label.toUpperCase();
    document.querySelector("#languageWritingMeaning").textContent = meaning();
    const input = document.querySelector("#languageWritingInput");
    input.lang = locale;
    input.placeholder = `${short} 문장을 입력하세요`;
    input.classList.toggle("completed", done());
    const result = document.querySelector("#languageWritingFeedback");
    result.hidden = !feedback;
    result.className = `language-writing-feedback${feedback ? ` ${feedback.type}` : ""}`;
    result.innerHTML = feedback ? `<strong>${esc(feedback.title)}</strong><span>${esc(feedback.copy)}</span>` : "";
    const hintBox = document.querySelector("#languageWritingHint");
    hintBox.hidden = hint === 0;
    hintBox.innerHTML = hint ? `<span>힌트 ${hint}/2</span><strong>${esc(hintText())}</strong>` : "";
    const hintButton = document.querySelector("#languageWritingHintButton");
    hintButton.disabled = hint >= 2;
    hintButton.textContent = hint >= 2 ? "힌트 모두 사용" : "💡 힌트";
    document.querySelector("#languageWritingReveal").textContent = revealed ? `정답: ${target()}` : "정답 보기";
    const checkButton = document.querySelector("#languageWritingCheck");
    checkButton.classList.toggle("done", done());
    checkButton.textContent = done() ? "✓ 완료된 문장" : "✓ 정답 확인";
  }

  function renderGoal() {
    if (mode !== "writing") return;
    const n = count();
    document.querySelector(".language-goal-copy p").textContent = "오늘의 쓰기 목표";
    document.querySelector("#languageGoalText").textContent = `${Math.min(n, GOAL)} / ${GOAL} 문장`;
    document.querySelector("#languageGoalBar").style.width = `${Math.min(100, n / GOAL * 100)}%`;
    document.querySelector("#languageGoalFlag").textContent = meta()[2];
  }

  function sync() {
    if (!document.querySelector("#languageView")) return;
    if (!document.querySelector("#languageModeSwitch") && !createUi()) return;
    const key = phraseKey();
    if (key !== lastPhrase) {
      lastPhrase = key;
      reset();
    }
    applyMode();
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; sync(); });
  }

  try { mode = localStorage.getItem(modeKey()) === "writing" ? "writing" : "speaking"; } catch { }
  let tries = 0;
  const boot = setInterval(() => {
    tries += 1;
    if (createUi() || document.querySelector("#languageModeSwitch") || tries > 50) {
      clearInterval(boot);
      schedule();
      const view = document.querySelector("#languageView");
      if (view) new MutationObserver(schedule).observe(view, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:["class","hidden"] });
    }
  }, 100);
})();
