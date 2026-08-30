(() => {
  const PARAM_NAME = "invite";
  const STORAGE_KEY = "family-pending-invite-v1";
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const CURRENT_INVITE_PATTERN = /^[A-F0-9]{6}$/i;
  const LEGACY_INVITE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/;
  const SHARE_BUTTON_HTML = '<span aria-hidden="true">↗</span> 초대 링크 공유';

  const normalizeCode = (value) => {
    const rawCode = String(value || "").trim();
    if (CURRENT_INVITE_PATTERN.test(rawCode)) return rawCode.toUpperCase();
    if (LEGACY_INVITE_PATTERN.test(rawCode)) return rawCode;
    return "";
  };

  const readStoredInvite = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      const code = normalizeCode(saved?.code);
      const savedAt = Number(saved?.savedAt || 0);
      if (!code || !savedAt || Date.now() - savedAt > MAX_AGE_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return "";
      }
      return code;
    } catch {
      return "";
    }
  };

  const storeInvite = (code) => {
    if (!code) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, savedAt: Date.now() }));
    } catch { /* URL에 남은 초대 정보로 계속 진행 */ }
  };

  const inviteFromUrl = () => {
    try {
      return normalizeCode(new URL(location.href).searchParams.get(PARAM_NAME));
    } catch {
      return "";
    }
  };

  const pendingInvite = () => inviteFromUrl() || readStoredInvite();

  const clearInvite = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* 저장소 정리 실패는 참여 결과에 영향 없음 */ }
    try {
      const url = new URL(location.href);
      if (!url.searchParams.has(PARAM_NAME)) return;
      url.searchParams.delete(PARAM_NAME);
      history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch { /* 주소 정리 실패는 참여 결과에 영향 없음 */ }
  };

  const buildInviteUrl = (code) => {
    const url = new URL(`${location.origin}${location.pathname}`);
    url.searchParams.set(PARAM_NAME, code);
    return url.toString();
  };

  const showToast = (message) => {
    if (typeof toast === "function") toast(message);
  };

  const setShareButtonFeedback = (button, html, duration = 1800) => {
    if (!button) return;
    window.clearTimeout(Number(button.dataset.inviteResetTimer || 0));
    button.innerHTML = html;
    if (!duration) return;
    const timer = window.setTimeout(() => {
      if (button.isConnected) button.innerHTML = SHARE_BUTTON_HTML;
      delete button.dataset.inviteResetTimer;
    }, duration);
    button.dataset.inviteResetTimer = String(timer);
  };

  const copyInviteUrl = async (url) => {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(url);
        return true;
      } catch (error) {
        console.warn("클립보드 API로 초대 링크 복사 실패", error);
      }
    }

    const input = document.createElement("textarea");
    input.value = url;
    input.setAttribute("readonly", "");
    input.setAttribute("aria-hidden", "true");
    input.style.position = "fixed";
    input.style.inset = "0 auto auto -9999px";
    input.style.opacity = "0";
    document.body.appendChild(input);
    try { input.focus({ preventScroll: true }); }
    catch { input.focus(); }
    input.select();
    input.setSelectionRange(0, input.value.length);

    let copied = false;
    try { copied = Boolean(document.execCommand("copy")); }
    catch (error) { console.warn("기본 복사 방식으로 초대 링크 복사 실패", error); }
    input.remove();
    return copied;
  };

  const revealManualInvite = (button, url) => {
    const card = button?.closest(".invite-link-card");
    if (!card) return;

    let fallback = card.querySelector("[data-invite-manual-link]");
    if (!fallback) {
      fallback = document.createElement("div");
      fallback.className = "invite-manual-link";
      fallback.dataset.inviteManualLink = "";
      fallback.innerHTML = `
        <label for="manualFamilyInviteUrl">공유가 열리지 않으면 아래 링크를 길게 눌러 복사하세요.</label>
        <input id="manualFamilyInviteUrl" type="text" readonly inputmode="none" />
      `;
      button.insertAdjacentElement("afterend", fallback);
    }

    const input = fallback.querySelector("input");
    input.value = url;
    fallback.hidden = false;
    requestAnimationFrame(() => {
      try { input.focus({ preventScroll: true }); }
      catch { input.focus(); }
      input.select();
      input.setSelectionRange(0, input.value.length);
    });
  };

  const shareInvite = async (button) => {
    if (!button || button.disabled) return;

    const code = normalizeCode(state.household?.invite_code);
    if (!code) {
      console.error("가족 초대 코드가 없거나 지원하지 않는 형식입니다");
      setShareButtonFeedback(button, '<span aria-hidden="true">!</span> 링크 생성 실패');
      showToast("초대 링크를 만들지 못했어요");
      return;
    }

    const url = buildInviteUrl(code);
    const householdName = state.household?.name || "우리 가족";
    const shareData = {
      title: `${householdName} 가족 공간 초대`,
      text: `${householdName} 가족 공간에 함께 참여해 주세요.`,
      url,
    };

    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    setShareButtonFeedback(button, '<span aria-hidden="true">…</span> 공유 준비 중', 0);

    try {
      const nativeShareAvailable = typeof navigator.share === "function";
      let nativeShareAllowed = nativeShareAvailable;
      if (nativeShareAvailable && typeof navigator.canShare === "function") {
        try { nativeShareAllowed = navigator.canShare(shareData); }
        catch { nativeShareAllowed = false; }
      }

      if (nativeShareAvailable && nativeShareAllowed) {
        try {
          await navigator.share(shareData);
          setShareButtonFeedback(button, '<span aria-hidden="true">✓</span> 공유 완료');
          return;
        } catch (error) {
          if (error?.name === "AbortError") {
            setShareButtonFeedback(button, SHARE_BUTTON_HTML, 0);
            return;
          }
          console.warn("기본 공유창을 열지 못해 링크 복사로 전환", error);
        }
      }

      if (await copyInviteUrl(url)) {
        setShareButtonFeedback(button, '<span aria-hidden="true">✓</span> 링크 복사됨');
        showToast("초대 링크를 복사했어요");
        return;
      }

      revealManualInvite(button, url);
      setShareButtonFeedback(button, '<span aria-hidden="true">↧</span> 아래 링크를 복사하세요', 2600);
      showToast("아래 초대 링크를 직접 복사해 주세요");
    } finally {
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
    }
  };

  const joinFromInvite = async (button) => {
    const code = pendingInvite();
    if (!code || !state.supabase || !state.session || state.household) return;

    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    const originalLabel = button.textContent;
    button.textContent = "참여 중…";
    const supabase = state.supabase;
    const userId = state.session.user.id;

    try {
      const { error } = await window.FAMILY_AUTH_API.withRecovery(() => supabase.rpc("join_household", { code }), {
        supabase,
        userId,
        isCurrent: () => state.supabase === supabase && state.session?.user?.id === userId && !state.household,
      });
      if (error) {
        console.error("초대 링크 참여 실패", error);
        showToast("초대 링크를 확인해 주세요");
        return;
      }
      clearInvite();
      await bootstrapData();
      renderAccount();
      showToast("가족 공간에 참여했어요");
    } finally {
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
      button.textContent = originalLabel;
    }
  };

  const bindAccountActions = (root) => {
    root.querySelector("#createHouseholdForm")?.addEventListener("submit", createHousehold);
    root.querySelector("#joinFamilyInvite")?.addEventListener("click", (event) => joinFromInvite(event.currentTarget));
    root.querySelector("#logoutButton")?.addEventListener("click", (event) => signOutCurrentUser(event.currentTarget));
  };

  const renderInviteAccount = () => {
    const root = document.querySelector("#accountContent");
    if (!root || !state.supabase || !state.session) return false;

    const inviteCode = pendingInvite();

    if (!state.household) {
      root.innerHTML = `
        ${inviteCode ? `
          <div class="account-card invite-link-card received">
            <span class="invite-link-icon" aria-hidden="true">🔗</span>
            <strong>가족 공간에 초대받았어요</strong>
            <p>참여하면 가족 일정과 성장 기록을 함께 볼 수 있어요.</p>
            <button class="primary-button invite-link-action" id="joinFamilyInvite" type="button">가족 공간 참여하기</button>
          </div>
          <div class="invite-link-divider"><span>또는</span></div>
        ` : ""}
        <div class="account-card">
          <strong>새 가족 공간 만들기</strong>
          <form class="account-form" id="createHouseholdForm">
            <input id="householdName" placeholder="예: 도윤이네" required />
            <button>만들기</button>
          </form>
        </div>
        ${inviteCode ? "" : '<p class="invite-link-help">초대받았다면 가족이 보내준 링크를 열어주세요.</p>'}
      `;
      bindAccountActions(root);
      return true;
    }

    root.innerHTML = `
      <div class="account-card invite-link-card shared">
        <span class="invite-link-icon" aria-hidden="true">👨‍👩‍👧‍👦</span>
        <strong>${escapeHtml(state.household.name)}</strong>
        <p>가족에게 초대 링크를 보내 함께 기록하세요.</p>
        <button class="primary-button invite-link-action" id="shareFamilyInvite" type="button">${SHARE_BUTTON_HTML}</button>
      </div>
      <button class="secondary-button" id="logoutButton" type="button">로그아웃</button>
    `;
    bindAccountActions(root);
    return true;
  };

  const originalRenderAccount = renderAccount;
  renderAccount = function inviteLinkRenderAccount() {
    originalRenderAccount.apply(this, arguments);
    renderInviteAccount();
  };

  const originalAuthRedirectUrl = authRedirectUrl;
  authRedirectUrl = function inviteAwareRedirectUrl() {
    const code = pendingInvite();
    if (!code) return originalAuthRedirectUrl();
    return buildInviteUrl(code);
  };

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("#shareFamilyInvite") : null;
    if (!target) return;
    event.preventDefault();
    shareInvite(target);
  }, true);

  const initialCode = inviteFromUrl();
  if (initialCode) storeInvite(initialCode);

  window.addEventListener("familycontextchange", (event) => {
    if (!event.detail?.householdId || !pendingInvite()) return;
    clearInvite();
  });
})();
