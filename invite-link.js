(() => {
  const PARAM_NAME = "invite";
  const STORAGE_KEY = "family-pending-invite-v1";
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const INVITE_PATTERN = /^[A-F0-9]{6}$/;

  const normalizeCode = (value) => {
    const code = String(value || "").trim().toUpperCase();
    return INVITE_PATTERN.test(code) ? code : "";
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

  const shareInvite = async () => {
    const code = normalizeCode(state.household?.invite_code);
    if (!code) return showToast("초대 링크를 만들지 못했어요");

    const url = buildInviteUrl(code);
    const shareData = {
      title: `${state.household.name} 가족 공간 초대`,
      text: `${state.household.name} 가족 공간에 함께 참여해 주세요.`,
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast("초대 링크를 복사했어요");
    } catch (error) {
      if (error?.name === "AbortError") return;
      try {
        const input = document.createElement("textarea");
        input.value = url;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
        showToast("초대 링크를 복사했어요");
      } catch {
        showToast("초대 링크를 공유하지 못했어요");
      }
    }
  };

  const joinFromInvite = async (button) => {
    const code = pendingInvite();
    if (!code || !state.supabase || !state.session || state.household) return;

    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    const originalLabel = button.textContent;
    button.textContent = "참여 중…";

    try {
      const { error } = await state.supabase.rpc("join_household", { code });
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
    root.querySelector("#shareFamilyInvite")?.addEventListener("click", shareInvite);
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
        <button class="primary-button invite-link-action" id="shareFamilyInvite" type="button"><span aria-hidden="true">↗</span> 초대 링크 공유</button>
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

  const initialCode = inviteFromUrl();
  if (initialCode) storeInvite(initialCode);

  window.addEventListener("familycontextchange", (event) => {
    if (!event.detail?.householdId || !pendingInvite()) return;
    clearInvite();
  });
})();
