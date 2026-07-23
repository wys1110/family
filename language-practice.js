(() => {
  if (document.documentElement.dataset.languagePracticeModule === "ready") return;
  document.documentElement.dataset.languagePracticeModule = "ready";

  const VIEW = "language";
  const ACTIVE_VIEW_KEY_FALLBACK = "family-active-view-v1";
  const SETTINGS_KEY = "family-language-practice-settings-v1";
  const HISTORY_KEY = "family-language-practice-history-v1";
  const DAILY_GOAL = 3;
  const SHADOW_TARGET = 3;

  const LANGUAGES = {
    english: {
      label: "English",
      shortLabel: "영어",
      flag: "🇺🇸",
      locale: "en-US",
      voicePattern: /Samantha|Ava|Karen|Daniel|Google US English|Microsoft Aria/i,
      phrases: [
        { id: "en-hello", topic: "daily", text: "How has your day been?", pronunciation: "하우 해즈 유어 데이 빈?", meaning: "오늘 하루 어땠어요?" },
        { id: "en-coffee", topic: "daily", text: "Would you like some coffee?", pronunciation: "우드 유 라이크 섬 커피?", meaning: "커피 좀 드실래요?" },
        { id: "en-later", topic: "daily", text: "I will take care of it later.", pronunciation: "아이 윌 테이크 케어 오브 잇 레이터.", meaning: "제가 나중에 처리할게요." },
        { id: "en-family-home", topic: "family", text: "What time will you be home?", pronunciation: "왓 타임 윌 유 비 홈?", meaning: "몇 시에 집에 올 거예요?" },
        { id: "en-baby-sleep", topic: "family", text: "The baby finally fell asleep.", pronunciation: "더 베이비 파이널리 펠 어슬립.", meaning: "아기가 드디어 잠들었어요." },
        { id: "en-help", topic: "family", text: "Let me know if you need any help.", pronunciation: "렛 미 노우 이프 유 니드 애니 헬프.", meaning: "도움이 필요하면 말해 주세요." },
        { id: "en-station", topic: "travel", text: "How do I get to the station?", pronunciation: "하우 두 아이 겟 투 더 스테이션?", meaning: "역에 어떻게 가나요?" },
        { id: "en-reservation", topic: "travel", text: "I have a reservation under Jayden.", pronunciation: "아이 해브 어 레저베이션 언더 제이든.", meaning: "Jayden 이름으로 예약했어요." },
        { id: "en-recommend", topic: "travel", text: "What do you recommend around here?", pronunciation: "왓 두 유 레커멘드 어라운드 히어?", meaning: "이 근처에서 무엇을 추천하세요?" },
        { id: "en-update", topic: "work", text: "Let me give you a quick update.", pronunciation: "렛 미 기브 유 어 퀵 업데이트.", meaning: "간단히 진행 상황을 말씀드릴게요." },
        { id: "en-confirm", topic: "work", text: "Could you confirm the deadline?", pronunciation: "쿠드 유 컨펌 더 데드라인?", meaning: "마감일을 확인해 주시겠어요?" },
        { id: "en-followup", topic: "work", text: "I will follow up by tomorrow.", pronunciation: "아이 윌 팔로우 업 바이 투모로우.", meaning: "내일까지 후속 조치하겠습니다." }
      ]
    },
    japanese: {
      label: "日本語",
      shortLabel: "일본어",
      flag: "🇯🇵",
      locale: "ja-JP",
      voicePattern: /Kyoko|Otoya|Hattori|Google.*日本語|Microsoft.*Nanami/i,
      phrases: [
        { id: "ja-hello", topic: "daily", text: "今日はどうでしたか？", pronunciation: "Kyō wa dō deshita ka?", meaning: "오늘 하루 어땠어요?" },
        { id: "ja-coffee", topic: "daily", text: "コーヒーはいかがですか？", pronunciation: "Kōhī wa ikaga desu ka?", meaning: "커피는 어떠세요?" },
        { id: "ja-later", topic: "daily", text: "あとでやっておきます。", pronunciation: "Ato de yatte okimasu.", meaning: "나중에 해둘게요." },
        { id: "ja-family-home", topic: "family", text: "何時に家に帰りますか？", pronunciation: "Nanji ni ie ni kaerimasu ka?", meaning: "몇 시에 집에 돌아와요?" },
        { id: "ja-baby-sleep", topic: "family", text: "赤ちゃんがやっと寝ました。", pronunciation: "Akachan ga yatto nemashita.", meaning: "아기가 드디어 잠들었어요." },
        { id: "ja-help", topic: "family", text: "手伝いが必要なら言ってください。", pronunciation: "Tetsudai ga hitsuyō nara itte kudasai.", meaning: "도움이 필요하면 말해 주세요." },
        { id: "ja-station", topic: "travel", text: "駅にはどうやって行きますか？", pronunciation: "Eki ni wa dō yatte ikimasu ka?", meaning: "역에는 어떻게 가나요?" },
        { id: "ja-reservation", topic: "travel", text: "ジェイデンの名前で予約しています。", pronunciation: "Jeiden no namae de yoyaku shiteimasu.", meaning: "Jayden 이름으로 예약했습니다." },
        { id: "ja-recommend", topic: "travel", text: "この辺でおすすめはありますか？", pronunciation: "Kono hen de osusume wa arimasu ka?", meaning: "이 근처에 추천할 곳이 있나요?" },
        { id: "ja-update", topic: "work", text: "簡単に進捗を共有します。", pronunciation: "Kantan ni shinchoku o kyōyū shimasu.", meaning: "간단히 진행 상황을 공유하겠습니다." },
        { id: "ja-confirm", topic: "work", text: "締め切りを確認していただけますか？", pronunciation: "Shimekiri o kakunin shite itadakemasu ka?", meaning: "마감일을 확인해 주시겠어요?" },
        { id: "ja-followup", topic: "work", text: "明日までにフォローします。", pronunciation: "Ashita made ni forō shimasu.", meaning: "내일까지 후속 조치하겠습니다." }
      ]
    },
    spanish: {
      label: "Español",
      shortLabel: "스페인어",
      flag: "🇪🇸",
      locale: "es-ES",
      voicePattern: /Monica|Jorge|Paulina|Google español|Microsoft.*Elvira/i,
      phrases: [
        { id: "es-hello", topic: "daily", text: "¿Cómo ha ido tu día?", pronunciation: "꼬모 아 이도 뚜 디아?", meaning: "오늘 하루 어땠어요?" },
        { id: "es-coffee", topic: "daily", text: "¿Quieres un poco de café?", pronunciation: "끼에레스 운 뽀꼬 데 카페?", meaning: "커피 좀 마실래요?" },
        { id: "es-later", topic: "daily", text: "Me encargaré de eso más tarde.", pronunciation: "메 엔까르가레 데 에소 마스 따르데.", meaning: "제가 나중에 처리할게요." },
        { id: "es-family-home", topic: "family", text: "¿A qué hora llegarás a casa?", pronunciation: "아 께 오라 예가라스 아 까사?", meaning: "몇 시에 집에 도착해요?" },
        { id: "es-baby-sleep", topic: "family", text: "El bebé por fin se durmió.", pronunciation: "엘 베베 뽀르 핀 세 두르미오.", meaning: "아기가 드디어 잠들었어요." },
        { id: "es-help", topic: "family", text: "Dime si necesitas ayuda.", pronunciation: "디메 시 네세시따스 아유다.", meaning: "도움이 필요하면 말해 주세요." },
        { id: "es-station", topic: "travel", text: "¿Cómo llego a la estación?", pronunciation: "꼬모 예고 아 라 에스따시온?", meaning: "역에 어떻게 가나요?" },
        { id: "es-reservation", topic: "travel", text: "Tengo una reserva a nombre de Jayden.", pronunciation: "뗑고 우나 레세르바 아 놈브레 데 제이든.", meaning: "Jayden 이름으로 예약했어요." },
        { id: "es-recommend", topic: "travel", text: "¿Qué recomiendas por aquí?", pronunciation: "께 레꼬미엔다스 뽀르 아끼?", meaning: "이 근처에서 무엇을 추천해요?" },
        { id: "es-update", topic: "work", text: "Déjame darte una actualización rápida.", pronunciation: "데하메 다르떼 우나 악뚜알리사시온 라삐다.", meaning: "간단히 진행 상황을 말씀드릴게요." },
        { id: "es-confirm", topic: "work", text: "¿Podrías confirmar la fecha límite?", pronunciation: "뽀드리아스 꼰피르마르 라 페차 리미떼?", meaning: "마감일을 확인해 주시겠어요?" },
        { id: "es-followup", topic: "work", text: "Haré el seguimiento mañana.", pronunciation: "아레 엘 세기미엔또 마냐나.", meaning: "내일 후속 조치하겠습니다." }
      ]
    }
  };

  const TOPICS = {
    all: ["✨", "전체"],
    daily: ["☀️", "일상"],
    family: ["🏠", "가족"],
    travel: ["✈️", "여행"],
    work: ["💼", "업무"]
  };

  const stateRef = () => (typeof state !== "undefined" ? state : null);
  const notify = (message) => (typeof toast === "function" ? toast(message) : window.alert(message));
  const escapeText = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const todayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };
  const userScope = () => stateRef()?.session?.user?.id || "device";
  const settingsStorageKey = () => `${SETTINGS_KEY}:${userScope()}`;
  const historyStorageKey = () => `${HISTORY_KEY}:${userScope()}`;

  const practice = {
    language: "english",
    topic: "all",
    index: 0,
    showMeaning: true,
    speaking: false,
    utteranceToken: 0
  };

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
    catch { return fallback; }
  }

  function loadSettings() {
    const saved = readJson(settingsStorageKey(), {});
    practice.language = LANGUAGES[saved.language] ? saved.language : "english";
    practice.topic = TOPICS[saved.topic] ? saved.topic : "all";
    practice.index = Number.isInteger(saved.index) ? Math.max(0, saved.index) : 0;
    practice.showMeaning = saved.showMeaning !== false;
  }

  function saveSettings() {
    try {
      localStorage.setItem(settingsStorageKey(), JSON.stringify({
        language: practice.language,
        topic: practice.topic,
        index: practice.index,
        showMeaning: practice.showMeaning
      }));
    } catch { }
  }

  function history() { return readJson(historyStorageKey(), {}); }
  function saveHistory(value) {
    try { localStorage.setItem(historyStorageKey(), JSON.stringify(value)); }
    catch { }
  }

  function currentLanguage() { return LANGUAGES[practice.language]; }
  function filteredPhrases() {
    const phrases = currentLanguage().phrases;
    return practice.topic === "all" ? phrases : phrases.filter((phrase) => phrase.topic === practice.topic);
  }
  function currentPhrase() {
    const phrases = filteredPhrases();
    if (!phrases.length) return null;
    practice.index = Math.min(practice.index, phrases.length - 1);
    return phrases[practice.index];
  }

  function dayProgress(languageKey = practice.language) {
    const data = history();
    return data[todayKey()]?.[languageKey] || {};
  }

  function shadowCount(phraseId) { return Number(dayProgress()[phraseId] || 0); }
  function completedCount(languageKey = practice.language) {
    return Object.values(dayProgress(languageKey)).filter((count) => Number(count) >= SHADOW_TARGET).length;
  }

  function dateMinus(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function streak() {
    const data = history();
    let result = 0;
    for (let offset = 0; offset < 3650; offset += 1) {
      const entry = data[dateMinus(offset)] || {};
      const completed = Object.values(entry).some((languageProgress) =>
        Object.values(languageProgress || {}).filter((count) => Number(count) >= SHADOW_TARGET).length >= DAILY_GOAL
      );
      if (!completed) break;
      result += 1;
    }
    return result;
  }

  function installViewWrapper() {
    if (typeof switchView !== "function" || switchView.__languagePracticeInstalled) return;
    const previousSwitchView = switchView;
    const wrappedSwitchView = function (view) {
      const languageView = document.querySelector("#languageView");
      const addButton = document.querySelector("#addEventButton");
      if (view !== VIEW) {
        stopSpeech();
        if (languageView) languageView.hidden = true;
        if (addButton) addButton.hidden = false;
        return previousSwitchView(view);
      }

      const appState = stateRef();
      if (appState) appState.activeView = VIEW;
      try {
        localStorage.setItem(typeof ACTIVE_VIEW_KEY !== "undefined" ? ACTIVE_VIEW_KEY : ACTIVE_VIEW_KEY_FALLBACK, VIEW);
      } catch { }

      ["calendarView", "growthView", "englishView", "privateView", "featureRequestView", "settingsView"].forEach((id) => {
        document.querySelector(`#${id}`)?.setAttribute("hidden", "");
      });
      if (languageView) languageView.hidden = false;
      document.querySelectorAll(".view-tab").forEach((button) => {
        const active = button.dataset.view === VIEW;
        button.classList.toggle("active", active);
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(active));
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      if (addButton) addButton.hidden = true;
      render();
    };
    Object.keys(previousSwitchView).forEach((key) => {
      try { wrappedSwitchView[key] = previousSwitchView[key]; } catch { }
    });
    wrappedSwitchView.__languagePracticeInstalled = true;
    switchView = wrappedSwitchView;
  }

  function createUi() {
    const navigation = document.querySelector(".view-tabs");
    const main = document.querySelector("main");
    if (!navigation || !main || document.querySelector('[data-view="language"]')) return;

    const tab = document.createElement("button");
    tab.className = "view-tab language-view-tab";
    tab.dataset.view = VIEW;
    tab.type = "button";
    tab.setAttribute("aria-label", "언어");
    tab.innerHTML = '<span class="view-tab-icon" aria-hidden="true">🌍</span><span class="view-tab-label">언어</span>';
    const englishTab = navigation.querySelector('[data-view="english"]');
    navigation.insertBefore(tab, englishTab || null);

    const view = document.createElement("div");
    view.id = "languageView";
    view.hidden = true;
    view.innerHTML = `
      <header class="language-page-header">
        <div>
          <p class="eyebrow">MULTILINGUAL PRACTICE</p>
          <h2><span aria-hidden="true">🌍</span> 언어 연습</h2>
          <p>하루 세 문장씩 듣고, 세 번 따라 말해요.</p>
        </div>
        <div class="language-streak-card"><span>🔥</span><strong id="languageStreak">0</strong><small>일 연속</small></div>
      </header>

      <section class="language-selector-card" aria-labelledby="languageSelectorTitle">
        <div class="language-section-heading"><div><p class="eyebrow">CHOOSE A LANGUAGE</p><h3 id="languageSelectorTitle">오늘 배울 언어</h3></div><span>더 많은 언어 추가 가능</span></div>
        <div class="language-selector" id="languageSelector"></div>
      </section>

      <section class="language-goal-card">
        <div class="language-goal-copy"><span id="languageGoalFlag">🇺🇸</span><div><p>오늘의 목표</p><strong id="languageGoalText">0 / ${DAILY_GOAL} 문장</strong></div></div>
        <div class="language-goal-track" aria-hidden="true"><i id="languageGoalBar"></i></div>
      </section>

      <section class="language-practice-card" aria-labelledby="languagePhraseText">
        <div class="language-topic-bar" id="languageTopicBar"></div>
        <div class="language-phrase-meta"><span id="languagePhraseTopic"></span><small id="languagePhrasePosition"></small></div>
        <blockquote id="languagePhraseText"></blockquote>
        <p class="language-pronunciation" id="languagePronunciation"></p>
        <p class="language-meaning" id="languageMeaning"></p>

        <div class="language-audio-actions">
          <button type="button" id="languageListen"><span aria-hidden="true">🔊</span><strong>듣기</strong></button>
          <button type="button" id="languageSlow"><span aria-hidden="true">🐢</span><strong>천천히</strong></button>
          <button type="button" id="languageMeaningToggle"><span aria-hidden="true">가</span><strong>뜻 숨기기</strong></button>
        </div>

        <div class="language-shadow-card">
          <div><p>SHADOWING</p><strong>문장을 소리 내어 따라 말해 보세요</strong><small>한 문장당 세 번 반복하면 완료돼요.</small></div>
          <div class="language-shadow-dots" id="languageShadowDots" aria-label="따라 말하기 횟수"></div>
          <button type="button" id="languageShadowButton">따라 말했어요</button>
        </div>

        <div class="language-phrase-navigation">
          <button type="button" id="languagePrevious" aria-label="이전 문장">‹</button>
          <button type="button" id="languageRandom">다른 문장</button>
          <button type="button" id="languageNext" aria-label="다음 문장">›</button>
        </div>
      </section>

      <section class="language-progress-section" aria-labelledby="languageProgressTitle">
        <div class="section-heading"><div><p class="eyebrow">TODAY'S PROGRESS</p><h2 id="languageProgressTitle">언어별 오늘 기록</h2></div></div>
        <div class="language-progress-grid" id="languageProgressGrid"></div>
      </section>`;

    const englishView = document.querySelector("#englishView");
    main.insertBefore(view, englishView || null);

    tab.addEventListener("click", () => switchView(VIEW));
    tab.addEventListener("pointerup", (event) => {
      if (["touch", "pen"].includes(event.pointerType)) requestAnimationFrame(() => tab.blur());
    });
    document.querySelector("#languageSelector")?.addEventListener("click", selectLanguage);
    document.querySelector("#languageTopicBar")?.addEventListener("click", selectTopic);
    document.querySelector("#languageListen")?.addEventListener("click", () => speakCurrent(0.95));
    document.querySelector("#languageSlow")?.addEventListener("click", () => speakCurrent(0.72));
    document.querySelector("#languageMeaningToggle")?.addEventListener("click", toggleMeaning);
    document.querySelector("#languageShadowButton")?.addEventListener("click", markShadowing);
    document.querySelector("#languagePrevious")?.addEventListener("click", () => movePhrase(-1));
    document.querySelector("#languageNext")?.addEventListener("click", () => movePhrase(1));
    document.querySelector("#languageRandom")?.addEventListener("click", randomPhrase);
  }

  function selectLanguage(event) {
    const button = event.target.closest("[data-language]");
    if (!button || !LANGUAGES[button.dataset.language]) return;
    stopSpeech();
    practice.language = button.dataset.language;
    practice.index = 0;
    saveSettings();
    render();
  }

  function selectTopic(event) {
    const button = event.target.closest("[data-topic]");
    if (!button || !TOPICS[button.dataset.topic]) return;
    stopSpeech();
    practice.topic = button.dataset.topic;
    practice.index = 0;
    saveSettings();
    render();
  }

  function toggleMeaning() {
    practice.showMeaning = !practice.showMeaning;
    saveSettings();
    renderPhrase();
  }

  function movePhrase(delta) {
    stopSpeech();
    const phrases = filteredPhrases();
    if (!phrases.length) return;
    practice.index = (practice.index + delta + phrases.length) % phrases.length;
    saveSettings();
    renderPhrase();
  }

  function randomPhrase() {
    stopSpeech();
    const phrases = filteredPhrases();
    if (phrases.length < 2) return;
    let next = practice.index;
    while (next === practice.index) next = Math.floor(Math.random() * phrases.length);
    practice.index = next;
    saveSettings();
    renderPhrase();
  }

  function markShadowing() {
    const phrase = currentPhrase();
    if (!phrase) return;
    const data = history();
    const date = todayKey();
    data[date] ||= {};
    data[date][practice.language] ||= {};
    const previous = Number(data[date][practice.language][phrase.id] || 0);
    data[date][practice.language][phrase.id] = Math.min(SHADOW_TARGET, previous + 1);
    saveHistory(data);
    render();
    const next = previous + 1;
    if (next >= SHADOW_TARGET) notify("이 문장을 세 번 연습했어요 🎉");
    else notify(`${next}번 따라 말했어요`);
  }

  function preferredVoice(language) {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const matches = voices.filter((voice) => voice.lang?.toLowerCase().startsWith(language.locale.slice(0, 2).toLowerCase()));
    return matches.find((voice) => language.voicePattern.test(voice.name)) || matches[0] || null;
  }

  function speakCurrent(rate) {
    const phrase = currentPhrase();
    const language = currentLanguage();
    if (!phrase || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      notify("이 브라우저에서는 음성 읽기를 지원하지 않아요");
      return;
    }
    stopSpeech(false);
    const token = ++practice.utteranceToken;
    const utterance = new SpeechSynthesisUtterance(phrase.text);
    utterance.lang = language.locale;
    utterance.rate = rate;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voice = preferredVoice(language);
    if (voice) utterance.voice = voice;
    practice.speaking = true;
    renderSpeakingState(rate);
    utterance.onend = () => {
      if (token !== practice.utteranceToken) return;
      practice.speaking = false;
      renderSpeakingState();
    };
    utterance.onerror = utterance.onend;
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeech(renderState = true) {
    practice.utteranceToken += 1;
    practice.speaking = false;
    window.speechSynthesis?.cancel?.();
    if (renderState) renderSpeakingState();
  }

  function renderSpeakingState(rate = null) {
    const listen = document.querySelector("#languageListen");
    const slow = document.querySelector("#languageSlow");
    if (!listen || !slow) return;
    listen.classList.toggle("active", practice.speaking && rate === 0.95);
    slow.classList.toggle("active", practice.speaking && rate === 0.72);
  }

  function renderSelectors() {
    const languageSelector = document.querySelector("#languageSelector");
    const topicBar = document.querySelector("#languageTopicBar");
    if (!languageSelector || !topicBar) return;
    languageSelector.innerHTML = Object.entries(LANGUAGES).map(([key, language]) => `
      <button type="button" data-language="${key}" class="${key === practice.language ? "active" : ""}">
        <span aria-hidden="true">${language.flag}</span><strong>${escapeText(language.label)}</strong><small>${escapeText(language.shortLabel)}</small>
      </button>`).join("");
    topicBar.innerHTML = Object.entries(TOPICS).map(([key, [icon, label]]) => `
      <button type="button" data-topic="${key}" class="${key === practice.topic ? "active" : ""}"><span aria-hidden="true">${icon}</span>${label}</button>`).join("");
  }

  function renderPhrase() {
    const phrase = currentPhrase();
    const phrases = filteredPhrases();
    if (!phrase) return;
    const topic = TOPICS[phrase.topic] || TOPICS.all;
    document.querySelector("#languagePhraseTopic").textContent = `${topic[0]} ${topic[1]}`;
    document.querySelector("#languagePhrasePosition").textContent = `${practice.index + 1} / ${phrases.length}`;
    document.querySelector("#languagePhraseText").textContent = phrase.text;
    document.querySelector("#languagePronunciation").textContent = phrase.pronunciation;
    const meaning = document.querySelector("#languageMeaning");
    meaning.textContent = phrase.meaning;
    meaning.hidden = !practice.showMeaning;
    const meaningButton = document.querySelector("#languageMeaningToggle");
    meaningButton.classList.toggle("active", practice.showMeaning);
    meaningButton.querySelector("strong").textContent = practice.showMeaning ? "뜻 숨기기" : "한글 뜻";

    const count = shadowCount(phrase.id);
    const dots = document.querySelector("#languageShadowDots");
    dots.innerHTML = Array.from({ length: SHADOW_TARGET }, (_, index) => `<i class="${index < count ? "done" : ""}">${index < count ? "✓" : index + 1}</i>`).join("");
    const button = document.querySelector("#languageShadowButton");
    button.disabled = count >= SHADOW_TARGET;
    button.textContent = count >= SHADOW_TARGET ? "✓ 연습 완료" : "따라 말했어요";
    renderSpeakingState();
  }

  function renderProgress() {
    const currentDone = completedCount();
    const goalPercent = Math.min(100, (currentDone / DAILY_GOAL) * 100);
    document.querySelector("#languageStreak").textContent = String(streak());
    document.querySelector("#languageGoalFlag").textContent = currentLanguage().flag;
    document.querySelector("#languageGoalText").textContent = `${Math.min(currentDone, DAILY_GOAL)} / ${DAILY_GOAL} 문장`;
    document.querySelector("#languageGoalBar").style.width = `${goalPercent}%`;

    document.querySelector("#languageProgressGrid").innerHTML = Object.entries(LANGUAGES).map(([key, language]) => {
      const done = completedCount(key);
      const percent = Math.min(100, (done / DAILY_GOAL) * 100);
      return `<button type="button" data-progress-language="${key}" aria-label="${escapeText(language.shortLabel)} 연습 열기">
        <span>${language.flag}</span><div><strong>${escapeText(language.shortLabel)}</strong><small>${done}문장 완료</small><i><b style="width:${percent}%"></b></i></div><em>${done >= DAILY_GOAL ? "완료" : `${Math.min(done, DAILY_GOAL)}/${DAILY_GOAL}`}</em>
      </button>`;
    }).join("");
    document.querySelectorAll("[data-progress-language]").forEach((button) => button.addEventListener("click", () => {
      practice.language = button.dataset.progressLanguage;
      practice.index = 0;
      saveSettings();
      render();
      document.querySelector("#languageSelector")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));
  }

  function render() {
    if (!document.querySelector("#languageView")) return;
    renderSelectors();
    renderPhrase();
    renderProgress();
  }

  loadSettings();
  createUi();
  installViewWrapper();
  render();

  (function restoreView(attempt = 0) {
    installViewWrapper();
    const appState = stateRef();
    if (appState?.authReady || attempt > 40) {
      let stored = null;
      try { stored = localStorage.getItem(ACTIVE_VIEW_KEY_FALLBACK); } catch { }
      if (stored === VIEW && typeof switchView === "function") switchView(VIEW);
      return;
    }
    setTimeout(() => restoreView(attempt + 1), 100);
  })();

  window.addEventListener("familycontextchange", () => {
    stopSpeech();
    loadSettings();
    render();
  });
  window.addEventListener("beforeunload", () => stopSpeech());
})();
