(() => {
  const root = document.querySelector("#babyAiAssistant");
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = "true";

  let core;
  let chatHistory = [];
  let loadedBabyId = null;
  let loadSequence = 0;
  let latestStrategies = { feeding: null, sleep: null };

  const status = root.querySelector("#babyAiStatus");
  const profileForm = root.querySelector("#babyAiProfileForm");
  const chatForm = root.querySelector("#babyAiChatForm");
  const chatLog = root.querySelector("#babyAiChatLog");

  function familyContext() {
    if (typeof state === "undefined" || !state.supabase || !state.session || !state.household?.id || !state.activeBabyId) return null;
    return {
      supabase: state.supabase,
      userId: state.session.user.id,
      householdId: state.household.id,
      babyId: state.activeBabyId,
    };
  }

  function setStatus(message, kind = "") {
    status.textContent = message;
    status.className = `baby-ai-status${kind ? ` ${kind}` : ""}`;
  }

  function selectTab(name) {
    root.querySelectorAll("[data-baby-ai-tab]").forEach((button) => {
      const active = button.dataset.babyAiTab === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    root.querySelectorAll("[data-baby-ai-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.babyAiPanel !== name;
    });
  }

  async function loadBabyAi() {
    const context = familyContext();
    const sequence = ++loadSequence;
    if (!context) {
      loadedBabyId = null;
      latestStrategies = { feeding: null, sleep: null };
      clearProfileForm();
      renderStrategies([]);
      setStatus("가족 로그인과 아기 프로필을 연결하면 AI 도우미를 사용할 수 있어요.", "pending");
      return;
    }

    if (loadedBabyId !== context.babyId) {
      loadedBabyId = context.babyId;
      chatHistory = [];
      renderChat();
    }
    setStatus("가족 패턴과 전략을 불러오고 있어요.");

    const [profileResult, strategyResult, queueResult] = await Promise.all([
      context.supabase.from("baby_ai_profiles").select("*").eq("baby_id", context.babyId).maybeSingle(),
      context.supabase.from("baby_ai_strategy_drafts")
        .select("id,kind,status,content,source_window_start,source_window_end,source_log_count,generated_at,confirmed_at")
        .eq("baby_id", context.babyId)
        .in("status", ["draft", "confirmed"])
        .order("generated_at", { ascending: false })
        .limit(20),
      context.supabase.from("baby_ai_refresh_queue")
        .select("due_at,status,attempt_count,last_error")
        .eq("baby_id", context.babyId)
        .maybeSingle(),
    ]);
    if (sequence !== loadSequence || context.babyId !== familyContext()?.babyId) return;

    const firstError = profileResult.error || strategyResult.error || queueResult.error;
    if (firstError) {
      setStatus("AI 도우미 DB 설정이 필요해요. 관리자가 20260719 마이그레이션을 적용해 주세요.", "error");
      return;
    }

    fillProfileForm(profileResult.data);
    renderStrategies(strategyResult.data || []);
    renderQueueStatus(queueResult.data);
  }

  function renderQueueStatus(queue) {
    if (!queue) {
      setStatus("최근 7일 기록과 가족 패턴을 사용할 준비가 됐어요.");
      return;
    }
    if (queue.status === "failed" && Number(queue.attempt_count) >= 3) {
      setStatus("자동 전략 갱신이 세 번 실패했어요. 전략 탭에서 직접 다시 만들어 주세요.", "error");
      return;
    }
    const due = formatDateTime(queue.due_at);
    setStatus(`새 기록을 모으는 중이에요. ${due} 이후 수유·수면 전략을 갱신해요.`, "pending");
  }

  function clearProfileForm() {
    profileForm.reset();
  }

  function fillProfileForm(profile) {
    clearProfileForm();
    if (!profile) return;
    const values = {
      feedingMethod: profile.feeding_method,
      feedingTraits: profile.feeding_traits,
      sleepOnsetMethod: profile.sleep_onset_method,
      sleepEnvironment: profile.sleep_environment,
      temperament: profile.temperament,
      soothingMethods: profile.soothing_methods,
      babyNotes: profile.baby_notes,
      familyNotes: profile.family_notes,
      motherWakeTime: profile.mother_schedule?.wakeTime,
      motherSleepTime: profile.mother_schedule?.sleepTime,
      motherAwayStart: profile.mother_schedule?.awayStart,
      motherAwayEnd: profile.mother_schedule?.awayEnd,
      motherNightCareStart: profile.mother_schedule?.nightCareStart,
      motherNightCareEnd: profile.mother_schedule?.nightCareEnd,
      motherNotes: profile.mother_schedule?.notes,
      fatherWakeTime: profile.father_schedule?.wakeTime,
      fatherSleepTime: profile.father_schedule?.sleepTime,
      fatherAwayStart: profile.father_schedule?.awayStart,
      fatherAwayEnd: profile.father_schedule?.awayEnd,
      fatherNightCareStart: profile.father_schedule?.nightCareStart,
      fatherNightCareEnd: profile.father_schedule?.nightCareEnd,
      fatherNotes: profile.father_schedule?.notes,
    };
    Object.entries(values).forEach(([name, value]) => {
      const field = profileForm.elements.namedItem(name);
      if (field) field.value = value || "";
    });
  }

  function scheduleFromForm(formData, prefix) {
    return {
      wakeTime: formData.get(`${prefix}WakeTime`) || "",
      sleepTime: formData.get(`${prefix}SleepTime`) || "",
      awayStart: formData.get(`${prefix}AwayStart`) || "",
      awayEnd: formData.get(`${prefix}AwayEnd`) || "",
      nightCareStart: formData.get(`${prefix}NightCareStart`) || "",
      nightCareEnd: formData.get(`${prefix}NightCareEnd`) || "",
      notes: String(formData.get(`${prefix}Notes`) || "").trim(),
    };
  }

  async function saveProfile(event) {
    event.preventDefault();
    const context = familyContext();
    if (!context) return setStatus("먼저 가족 공간에 로그인하고 아기를 선택해 주세요.", "error");
    const button = profileForm.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "저장 중…";
    const data = new FormData(profileForm);
    const row = {
      baby_id: context.babyId,
      household_id: context.householdId,
      feeding_method: text(data, "feedingMethod"),
      feeding_traits: text(data, "feedingTraits"),
      sleep_onset_method: text(data, "sleepOnsetMethod"),
      sleep_environment: text(data, "sleepEnvironment"),
      temperament: text(data, "temperament"),
      soothing_methods: text(data, "soothingMethods"),
      baby_notes: text(data, "babyNotes"),
      mother_schedule: scheduleFromForm(data, "mother"),
      father_schedule: scheduleFromForm(data, "father"),
      family_notes: text(data, "familyNotes"),
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    try {
      const { error } = await context.supabase.from("baby_ai_profiles").upsert(row, { onConflict: "baby_id" });
      if (error) throw error;
      setStatus("가족 공동 패턴을 저장했어요.");
    } catch {
      setStatus("가족 패턴을 저장하지 못했어요. DB 설정과 연결을 확인해 주세요.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "가족 패턴 저장";
    }
  }

  async function askQuestion(event) {
    event.preventDefault();
    const context = familyContext();
    const input = chatForm.querySelector("#babyAiQuestion");
    const question = input.value.trim();
    if (!context || !question) return;
    const button = chatForm.querySelector('button[type="submit"]');
    const historyForRequest = chatHistory.slice(-8);
    chatHistory.push({ role: "user", text: question });
    input.value = "";
    renderChat();
    button.disabled = true;
    button.textContent = "답변 중…";
    try {
      const { data, error } = await context.supabase.functions.invoke("baby-ai", {
        body: { action: "chat", babyId: context.babyId, question, history: historyForRequest },
      });
      if (error || !data?.answer) throw error || new Error("EMPTY_ANSWER");
      chatHistory.push({ role: "assistant", text: data.answer, urgent: Boolean(data.urgent) });
    } catch {
      chatHistory.push({ role: "assistant", text: "답변을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.", error: true });
    } finally {
      renderChat();
      button.disabled = false;
      button.textContent = "질문하기";
    }
  }

  function renderChat() {
    if (!chatHistory.length) {
      chatLog.innerHTML = '<p class="baby-ai-empty">아기에 관해 궁금한 점을 물어보세요. 대화는 현재 화면에만 남아요.</p>';
      return;
    }
    chatLog.innerHTML = chatHistory.map((message) => {
      const classes = ["baby-ai-message", message.role === "user" ? "user" : "assistant"];
      if (message.urgent || message.error) classes.push("urgent");
      return `<p class="${classes.join(" ")}">${safeHtml(message.text)}</p>`;
    }).join("");
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  async function generateStrategy(kind, button) {
    const context = familyContext();
    if (!context) return setStatus("먼저 가족 공간에 로그인하고 아기를 선택해 주세요.", "error");
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "전략 만드는 중…";
    setStatus(`${kind === "feeding" ? "수유" : "수면"} 기록과 가족 패턴을 살펴보고 있어요.`);
    try {
      const { data, error } = await context.supabase.functions.invoke("baby-ai", {
        body: { action: "generate-strategy", babyId: context.babyId, kind },
      });
      if (error || !data?.draftId) throw error || new Error("EMPTY_DRAFT");
      setStatus("새 전략 제안을 만들었어요. 내용을 확인한 뒤 가족 전략으로 확정해 주세요.");
      await loadBabyAi();
    } catch {
      setStatus("전략을 만들지 못했어요. AI Function 설정과 연결을 확인해 주세요.", "error");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function renderStrategies(strategies) {
    latestStrategies = { feeding: chooseStrategy(strategies, "feeding"), sleep: chooseStrategy(strategies, "sleep") };
    ["feeding", "sleep"].forEach((kind) => renderStrategyCard(kind, latestStrategies[kind]));
  }

  function chooseStrategy(strategies, kind) {
    const matching = strategies.filter((item) => item.kind === kind);
    return matching.find((item) => item.status === "draft") || matching.find((item) => item.status === "confirmed") || null;
  }

  function renderStrategyCard(kind, strategy) {
    const card = root.querySelector(`[data-strategy-kind="${kind}"]`);
    const stateLabel = card.querySelector("[data-strategy-state]");
    const contentRoot = card.querySelector("[data-strategy-content]");
    if (!strategy) {
      stateLabel.textContent = "아직 없음";
      contentRoot.innerHTML = `<p class="baby-ai-empty">프로필과 ${kind === "feeding" ? "수유" : "수면"} 기록을 준비하면 전략을 만들 수 있어요.</p>`;
      return;
    }
    const content = strategy.content || {};
    stateLabel.textContent = strategy.status === "draft" ? "새 제안" : "가족 확정";
    const sections = core.formatStrategySections(content).filter((section) => section.items.length);
    contentRoot.innerHTML = `
      <p class="baby-ai-strategy-summary">${safeHtml(content.summary || "")}</p>
      ${sections.map((section) => `<section class="baby-ai-strategy-section"><strong>${safeHtml(section.title)}</strong><ul>${section.items.map((item) => `<li>${safeHtml(item)}</li>`).join("")}</ul></section>`).join("")}
      ${content.safety ? `<section class="baby-ai-strategy-section"><strong>안전 안내</strong><ul><li>${safeHtml(content.safety)}</li></ul></section>` : ""}
      <p class="baby-ai-strategy-meta"><span>최근 ${Number(strategy.source_log_count || 0)}개 기록 참고</span><span>${safeHtml(formatDateTime(strategy.generated_at))} 생성</span></p>
      ${strategy.status === "draft" ? `<button class="baby-ai-confirm" type="button" data-confirm-strategy="${safeHtml(strategy.id)}">가족 전략으로 확정</button>` : ""}
    `;
  }

  async function confirmStrategy(strategyId, button) {
    const context = familyContext();
    if (!context) return;
    button.disabled = true;
    button.textContent = "확정 중…";
    const { error } = await context.supabase.rpc("confirm_baby_ai_strategy", { target_strategy_id: strategyId });
    if (error) {
      button.disabled = false;
      button.textContent = "가족 전략으로 확정";
      return setStatus("전략을 확정하지 못했어요. 다시 시도해 주세요.", "error");
    }
    setStatus("가족 공동 전략으로 확정했어요.");
    await loadBabyAi();
  }

  function text(formData, name) {
    return String(formData.get(name) || "").trim() || null;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "시간 미정";
    return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function safeHtml(value) {
    if (typeof escapeHtml === "function") return escapeHtml(String(value || ""));
    const element = document.createElement("span");
    element.textContent = String(value || "");
    return element.innerHTML;
  }

  root.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-baby-ai-tab]");
    if (tab) selectTab(tab.dataset.babyAiTab);
    const generate = event.target.closest("[data-generate-strategy]");
    if (generate) generateStrategy(generate.dataset.generateStrategy, generate);
    const confirm = event.target.closest("[data-confirm-strategy]");
    if (confirm) confirmStrategy(confirm.dataset.confirmStrategy, confirm);
  });
  profileForm.addEventListener("submit", saveProfile);
  chatForm.addEventListener("submit", askQuestion);
  window.addEventListener("familybabychange", loadBabyAi);
  window.addEventListener("familycontextchange", loadBabyAi);

  import("./baby-ai-core.js?v=20260719-v1")
    .then((module) => {
      core = module;
      loadBabyAi();
    })
    .catch(() => setStatus("AI 화면 모듈을 불러오지 못했어요. 새로고침해 주세요.", "error"));
})();
