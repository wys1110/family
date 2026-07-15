(() => {
  const PRIVATE_VIEW = "private";
  const PRIVATE_TABLE = "private_entries";
  const ACTIVE_VIEW_KEY_FALLBACK = "family-active-view-v1";
  const privateState = { entries: [], loading: false, loadedForUser: null };

  const escapePrivateHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
  const localDateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const privateId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const appState = () => (typeof state !== "undefined" ? state : null);
  const appToast = (message) => {
    if (typeof toast === "function") toast(message);
    else window.alert(message);
  };

  function injectPrivateUi() {
    const nav = document.querySelector(".view-tabs");
    const main = document.querySelector("main");
    if (!nav || !main || document.querySelector('[data-view="private"]')) return;

    const tab = document.createElement("button");
    tab.className = "view-tab private-view-tab";
    tab.dataset.view = PRIVATE_VIEW;
    tab.type = "button";
    tab.innerHTML = '<span aria-hidden="true">🔒</span> 나만의 공간';
    nav.appendChild(tab);

    const view = document.createElement("div");
    view.id = "privateView";
    view.hidden = true;
    view.innerHTML = `
      <header class="private-page-header">
        <div>
          <p class="eyebrow">ONLY FOR ME</p>
          <h2>나만의 공간</h2>
          <span>가족 구성원에게도 보이지 않는 개인 기록이에요.</span>
        </div>
        <span class="private-lock-mark" aria-hidden="true">🔒</span>
      </header>
      <section class="private-security-card" id="privateSecurityCard">
        <div class="private-security-icon" aria-hidden="true">✓</div>
        <div><strong>내 계정에만 저장</strong><p id="privateSecurityCopy">로그인한 본인만 읽고 수정할 수 있어요.</p></div>
      </section>
      <section class="private-compose-card">
        <button type="button" id="privateQuickAddButton"><span>＋</span><div><strong>새 개인 기록</strong><small>일기, 기도, 생각, 개인 메모를 남겨보세요</small></div><i aria-hidden="true">›</i></button>
      </section>
      <section class="private-list-section" aria-labelledby="privateListTitle">
        <div class="section-heading">
          <div><p class="eyebrow">PRIVATE ARCHIVE</p><h2 id="privateListTitle">내 기록</h2></div>
          <span class="count-badge" id="privateEntryCount"></span>
        </div>
        <div class="private-filter-bar" id="privateFilterBar" role="group" aria-label="개인 기록 분류">
          <button type="button" class="active" data-private-filter="all">전체</button>
          <button type="button" data-private-filter="일기">일기</button>
          <button type="button" data-private-filter="기도">기도</button>
          <button type="button" data-private-filter="생각">생각</button>
          <button type="button" data-private-filter="메모">메모</button>
        </div>
        <div class="private-entry-list" id="privateEntryList"></div>
      </section>`;
    main.appendChild(view);

    const dialog = document.createElement("dialog");
    dialog.id = "privateEntryDialog";
    dialog.className = "sheet-dialog private-entry-dialog";
    dialog.innerHTML = `
      <form id="privateEntryForm" method="dialog">
        <div class="sheet-handle"></div>
        <div class="dialog-header">
          <div><p class="eyebrow">ONLY FOR ME</p><h2 id="privateDialogTitle">새 개인 기록</h2></div>
          <button type="button" class="close-button" data-private-close aria-label="닫기">×</button>
        </div>
        <input type="hidden" id="privateEntryId" />
        <div class="form-row">
          <label>날짜<input id="privateEntryDate" type="date" required /></label>
          <label>분류<select id="privateEntryType"><option>일기</option><option>기도</option><option>생각</option><option>메모</option></select></label>
        </div>
        <label class="title-field">제목<input id="privateEntryTitle" maxlength="80" autocomplete="off" placeholder="오늘의 제목" required /></label>
        <label>내용<textarea id="privateEntryContent" maxlength="5000" rows="10" placeholder="누구에게도 보여주지 않을 내 이야기를 적어보세요." required></textarea></label>
        <p class="form-privacy-note private-form-note"><span aria-hidden="true">🔒</span> 이 기록은 현재 로그인한 계정에서만 볼 수 있어요.</p>
        <div class="dialog-actions">
          <button type="button" class="danger-button" id="deletePrivateEntryButton">삭제</button>
          <button type="submit" class="primary-button" id="privateEntrySubmitButton">저장</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
  }

  function installPrivateViewRouting() {
    if (typeof switchView !== "function" || switchView.__privateSpaceInstalled) return;
    const baseSwitchView = switchView;
    const wrappedSwitchView = function(view) {
      const privateView = document.querySelector("#privateView");
      if (view !== PRIVATE_VIEW) {
        if (privateView) privateView.hidden = true;
        return baseSwitchView(view);
      }

      const currentState = appState();
      if (currentState) currentState.activeView = PRIVATE_VIEW;
      try { localStorage.setItem(typeof ACTIVE_VIEW_KEY !== "undefined" ? ACTIVE_VIEW_KEY : ACTIVE_VIEW_KEY_FALLBACK, PRIVATE_VIEW); } catch {}
      document.querySelector("#calendarView")?.setAttribute("hidden", "");
      document.querySelector("#growthView")?.setAttribute("hidden", "");
      if (privateView) privateView.hidden = false;
      document.querySelectorAll(".view-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === PRIVATE_VIEW));
      const addButton = document.querySelector("#addEventButton");
      if (addButton) {
        addButton.innerHTML = "<span>＋</span> 개인 기록";
        addButton.setAttribute("aria-label", "새 개인 기록");
      }
      loadPrivateEntries();
    };
    wrappedSwitchView.__privateSpaceInstalled = true;
    switchView = wrappedSwitchView;
  }

  function bindPrivateUi() {
    document.querySelector('[data-view="private"]')?.addEventListener("click", () => switchView(PRIVATE_VIEW));
    document.querySelector("#privateQuickAddButton")?.addEventListener("click", () => openPrivateDialog());
    document.querySelector("#privateEntryForm")?.addEventListener("submit", savePrivateEntry);
    document.querySelector("#deletePrivateEntryButton")?.addEventListener("click", deletePrivateEntry);
    document.querySelector("[data-private-close]")?.addEventListener("click", () => document.querySelector("#privateEntryDialog")?.close());
    document.querySelector("#privateEntryList")?.addEventListener("click", handlePrivateListClick);
    document.querySelector("#privateFilterBar")?.addEventListener("click", handlePrivateFilter);
    document.querySelector("#addEventButton")?.addEventListener("click", (event) => {
      if (appState()?.activeView !== PRIVATE_VIEW) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openPrivateDialog();
    }, true);
  }

  function currentUser() {
    return appState()?.session?.user || null;
  }

  async function loadPrivateEntries(force = false) {
    const currentState = appState();
    const user = currentUser();
    const list = document.querySelector("#privateEntryList");
    if (!list) return;

    if (!currentState?.supabase || !user) {
      privateState.entries = [];
      privateState.loadedForUser = null;
      renderPrivateLocked();
      return;
    }
    if (!force && privateState.loading) return;
    if (!force && privateState.loadedForUser === user.id) {
      renderPrivateEntries();
      return;
    }

    privateState.loading = true;
    list.innerHTML = '<div class="private-loading">내 기록을 안전하게 불러오는 중…</div>';
    const { data, error } = await currentState.supabase
      .from(PRIVATE_TABLE)
      .select("id,owner_id,entry_date,entry_type,title,content,created_at,updated_at")
      .eq("owner_id", user.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    privateState.loading = false;

    if (error) {
      privateState.entries = [];
      privateState.loadedForUser = null;
      renderPrivateSetupError(error);
      return;
    }
    privateState.entries = data || [];
    privateState.loadedForUser = user.id;
    renderPrivateEntries();
    updatePrivateSecurityCopy();
  }

  function updatePrivateSecurityCopy() {
    const user = currentUser();
    const copy = document.querySelector("#privateSecurityCopy");
    if (copy) copy.textContent = user?.email ? `${user.email} 계정에서만 볼 수 있어요.` : "로그인한 본인만 읽고 수정할 수 있어요.";
  }

  function renderPrivateLocked() {
    const list = document.querySelector("#privateEntryList");
    const count = document.querySelector("#privateEntryCount");
    if (count) count.textContent = "잠김";
    if (list) list.innerHTML = `
      <div class="private-empty-state private-locked-state">
        <span aria-hidden="true">🔐</span><h3>로그인이 필요한 공간이에요</h3>
        <p>개인 기록은 기기 저장이 아니라 로그인 계정에 암호화된 연결로 보관합니다.</p>
      </div>`;
  }

  function renderPrivateSetupError(error) {
    const list = document.querySelector("#privateEntryList");
    const count = document.querySelector("#privateEntryCount");
    if (count) count.textContent = "설정 필요";
    if (list) list.innerHTML = `
      <div class="private-empty-state private-setup-state">
        <span aria-hidden="true">🛠</span><h3>개인 공간 DB 설정이 필요해요</h3>
        <p>Supabase SQL Editor에서 <code>20260716_private_space.sql</code> 마이그레이션을 한 번 실행해 주세요.</p>
        <small>${escapePrivateHtml(error?.message || "private_entries 테이블을 확인해 주세요.")}</small>
      </div>`;
  }

  function activePrivateFilter() {
    return document.querySelector("#privateFilterBar .active")?.dataset.privateFilter || "all";
  }

  function renderPrivateEntries() {
    const list = document.querySelector("#privateEntryList");
    const count = document.querySelector("#privateEntryCount");
    if (!list) return;
    const filter = activePrivateFilter();
    const entries = filter === "all" ? privateState.entries : privateState.entries.filter((entry) => entry.entry_type === filter);
    if (count) count.textContent = `${privateState.entries.length}개`;

    if (!entries.length) {
      list.innerHTML = `
        <div class="private-empty-state">
          <span aria-hidden="true">✎</span><h3>${filter === "all" ? "아직 나만의 기록이 없어요" : `${escapePrivateHtml(filter)} 기록이 없어요`}</h3>
          <p>가족과 공유하지 않아도 되는 생각을 편하게 남겨보세요.</p>
          <button type="button" data-private-new>첫 기록 남기기</button>
        </div>`;
      return;
    }

    list.innerHTML = entries.map((entry) => {
      const preview = entry.content.length > 150 ? `${entry.content.slice(0, 150)}…` : entry.content;
      const date = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${entry.entry_date}T00:00:00`));
      return `
        <article class="private-entry-card" data-private-id="${escapePrivateHtml(entry.id)}">
          <button type="button" class="private-entry-open" data-private-edit="${escapePrivateHtml(entry.id)}">
            <div class="private-entry-meta"><span>${escapePrivateHtml(entry.entry_type || "일기")}</span><time>${escapePrivateHtml(date)}</time><i aria-hidden="true">🔒</i></div>
            <h3>${escapePrivateHtml(entry.title)}</h3>
            <p>${escapePrivateHtml(preview).replace(/\n/g, "<br>")}</p>
          </button>
        </article>`;
    }).join("");
  }

  function handlePrivateFilter(event) {
    const button = event.target.closest("[data-private-filter]");
    if (!button) return;
    document.querySelectorAll("[data-private-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderPrivateEntries();
  }

  function handlePrivateListClick(event) {
    if (event.target.closest("[data-private-new]")) return openPrivateDialog();
    const button = event.target.closest("[data-private-edit]");
    if (!button) return;
    const entry = privateState.entries.find((item) => item.id === button.dataset.privateEdit);
    if (entry) openPrivateDialog(entry);
  }

  function openPrivateDialog(entry = null) {
    if (!currentUser()) {
      appToast("개인 공간은 로그인 후 사용할 수 있어요");
      return;
    }
    const dialog = document.querySelector("#privateEntryDialog");
    document.querySelector("#privateDialogTitle").textContent = entry ? "개인 기록 수정" : "새 개인 기록";
    document.querySelector("#privateEntryId").value = entry?.id || "";
    document.querySelector("#privateEntryDate").value = entry?.entry_date || localDateKey();
    document.querySelector("#privateEntryType").value = entry?.entry_type || "일기";
    document.querySelector("#privateEntryTitle").value = entry?.title || "";
    document.querySelector("#privateEntryContent").value = entry?.content || "";
    document.querySelector("#deletePrivateEntryButton").hidden = !entry;
    if (!dialog.open) dialog.showModal();
    setTimeout(() => document.querySelector("#privateEntryTitle")?.focus(), 80);
  }

  async function savePrivateEntry(event) {
    event.preventDefault();
    const currentState = appState();
    const user = currentUser();
    if (!currentState?.supabase || !user) return appToast("로그인 상태를 확인해 주세요");

    const button = document.querySelector("#privateEntrySubmitButton");
    const id = document.querySelector("#privateEntryId").value || privateId();
    const payload = {
      id,
      owner_id: user.id,
      entry_date: document.querySelector("#privateEntryDate").value,
      entry_type: document.querySelector("#privateEntryType").value,
      title: document.querySelector("#privateEntryTitle").value.trim(),
      content: document.querySelector("#privateEntryContent").value.trim(),
      updated_at: new Date().toISOString(),
    };
    if (!payload.title || !payload.content) return;

    button.disabled = true;
    button.textContent = "저장 중…";
    const { error } = await currentState.supabase.from(PRIVATE_TABLE).upsert(payload, { onConflict: "id" });
    button.disabled = false;
    button.textContent = "저장";
    if (error) {
      appToast("개인 기록을 저장하지 못했어요");
      renderPrivateSetupError(error);
      return;
    }
    document.querySelector("#privateEntryDialog")?.close();
    privateState.loadedForUser = null;
    await loadPrivateEntries(true);
    appToast("나만의 공간에 저장했어요 🔒");
  }

  async function deletePrivateEntry() {
    const id = document.querySelector("#privateEntryId").value;
    const currentState = appState();
    const user = currentUser();
    if (!id || !currentState?.supabase || !user) return;
    if (!window.confirm("이 개인 기록을 삭제할까요?")) return;

    const { error } = await currentState.supabase.from(PRIVATE_TABLE).delete().eq("id", id).eq("owner_id", user.id);
    if (error) return appToast("개인 기록을 삭제하지 못했어요");
    document.querySelector("#privateEntryDialog")?.close();
    privateState.loadedForUser = null;
    await loadPrivateEntries(true);
    appToast("개인 기록을 삭제했어요");
  }

  function waitForAppReady(attempt = 0) {
    installPrivateViewRouting();
    const currentState = appState();
    if (currentState?.authReady || attempt > 40) {
      updatePrivateSecurityCopy();
      const savedView = (() => { try { return localStorage.getItem(ACTIVE_VIEW_KEY_FALLBACK); } catch { return null; } })();
      if (savedView === PRIVATE_VIEW && typeof switchView === "function") switchView(PRIVATE_VIEW);
      if (currentState?.supabase) {
        currentState.supabase.auth.onAuthStateChange(() => {
          privateState.loadedForUser = null;
          setTimeout(() => loadPrivateEntries(true), 0);
        });
      }
      return;
    }
    setTimeout(() => waitForAppReady(attempt + 1), 100);
  }

  injectPrivateUi();
  installPrivateViewRouting();
  bindPrivateUi();
  waitForAppReady();
})();
