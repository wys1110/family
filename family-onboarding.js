(() => {
  const currentState = () => (typeof state === 'undefined' ? null : state);
  const isDemo = () => window.FAMILY_DEMO_MODE === true;
  const hasFirstCare = (current) => Boolean(current?.activeBabyId && (current?.growthEntries || [])
    .some((entry) => entry.babyId === current.activeBabyId));

  let memberCount = isDemo() ? 2 : null;
  let membershipRequestId = 0;
  let memberRefreshTimer = null;
  let card = null;

  const deriveSnapshot = (current, currentMemberCount = memberCount) => {
    const hasBaby = Boolean(current?.activeBabyId && (current?.babies || []).some((baby) => baby.id === current.activeBabyId));
    const firstCareRecorded = hasBaby && hasFirstCare(current);
    return {
      hasBaby,
      hasFirstCare: firstCareRecorded,
      memberCount: currentMemberCount,
      isOwner: current?.householdRole === 'owner',
      complete: Boolean(hasBaby && firstCareRecorded && (currentMemberCount || 0) >= 2),
    };
  };

  const getSnapshot = () => deriveSnapshot(currentState());

  const clearMemberRefresh = () => {
    if (memberRefreshTimer === null) return;
    window.clearTimeout(memberRefreshTimer);
    memberRefreshTimer = null;
  };

  const scheduleMemberRefresh = () => {
    const current = currentState();
    if (memberRefreshTimer !== null || memberCount >= 2 || !current?.household || !current?.supabase || !current?.session) return;
    memberRefreshTimer = window.setTimeout(() => {
      memberRefreshTimer = null;
      loadMemberCount();
    }, 30000);
  };

  const nextStep = (snapshot) => {
    if (!snapshot.hasBaby) return { key: 'baby', label: '아기 등록하기' };
    if (!snapshot.hasFirstCare) return { key: 'care', label: '첫 기록 남기기' };
    if ((snapshot.memberCount || 0) < 2 && snapshot.isOwner) return { key: 'invite', label: '보호자 초대하기' };
    return null;
  };

  const stepRow = (complete, label, waiting = false) => `
    <li class="family-onboarding-step${complete ? ' complete' : ''}">
      <span aria-hidden="true">${complete ? '✓' : '○'}</span>
      <span>${label}</span>${waiting ? '<small>가족 초대를 기다리는 중</small>' : ''}
    </li>`;

  const render = () => {
    if (!card) return;
    const current = currentState();
    const snapshot = getSnapshot();
    const canDisplay = Boolean(current?.household) && memberCount !== null && !snapshot.complete;
    card.hidden = !canDisplay;
    if (!canDisplay) return;

    const waitingForFamily = snapshot.hasBaby && snapshot.hasFirstCare && (snapshot.memberCount || 0) < 2 && !snapshot.isOwner;
    const action = nextStep(snapshot);
    card.querySelector('[data-family-onboarding-steps]').innerHTML = [
      stepRow(snapshot.hasBaby, '아기 등록'),
      stepRow(snapshot.hasFirstCare, '첫 돌봄 기록'),
      stepRow((snapshot.memberCount || 0) >= 2, '보호자 연결', waitingForFamily),
    ].join('');

    const button = card.querySelector('[data-family-onboarding-action]');
    button.hidden = !action;
    button.dataset.familyOnboardingAction = action?.key || '';
    button.textContent = action?.label || '';
  };

  const loadMemberCount = async () => {
    const current = currentState();
    const householdId = current?.household?.id;
    const isRemote = Boolean(current?.supabase && current?.session);
    const requestId = ++membershipRequestId;

    if (!householdId) {
      clearMemberRefresh();
      memberCount = null;
      render();
      return;
    }
    if (!isRemote) {
      clearMemberRefresh();
      memberCount = isDemo() ? 2 : 1;
      render();
      return;
    }

    memberCount = null;
    render();
    const supabase = current.supabase;
    const userId = current.session.user.id;
    const { count, error } = await window.FAMILY_AUTH_API.withRecovery(() => supabase
      .from('household_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('household_id', householdId), {
        supabase,
        userId,
        isCurrent: () => state.supabase === supabase
          && state.session?.user?.id === userId
          && state.household?.id === householdId,
      });
    if (requestId !== membershipRequestId || state.household?.id !== householdId) return;
    if (error) {
      console.warn('가족 구성원 수를 불러오지 못했어요', error);
      memberCount = null;
      scheduleMemberRefresh();
    } else {
      memberCount = Number(count || 0);
      if (memberCount >= 2) clearMemberRefresh();
      else scheduleMemberRefresh();
    }
    render();
  };

  const mount = (attempt = 0) => {
    if (card || attempt > 40) return;
    const hero = document.querySelector('#calendarView .hero-card');
    if (!hero) return setTimeout(() => mount(attempt + 1), 50);

    card = document.createElement('section');
    card.className = 'family-onboarding-card';
    card.dataset.familyOnboardingModule = '';
    card.hidden = true;
    card.setAttribute('aria-labelledby', 'familyOnboardingTitle');
    card.innerHTML = `
      <div class="family-onboarding-heading"><div><p class="eyebrow">FAMILY START</p><h2 id="familyOnboardingTitle">가족 시작하기</h2></div><button type="button" class="family-onboarding-action" data-family-onboarding-action></button></div>
      <ol data-family-onboarding-steps></ol>`;
    hero.insertAdjacentElement('afterend', card);
    card.addEventListener('click', (event) => {
      const action = event.target.closest('[data-family-onboarding-action]')?.dataset.familyOnboardingAction;
      if (action === 'baby') return openBabyDialog();
      if (action === 'care') return openGrowthQuick('수유·이유식');
      if (action === 'invite') return openAccountDialog();
    });
    loadMemberCount();
  };

  ['familycontextchange', 'familybabychange', 'family:growth-entry-saved', 'family:growth-entry-deleted', 'family:baby-saved'].forEach((eventName) => {
    window.addEventListener(eventName, () => {
      if (eventName === 'familycontextchange') return loadMemberCount();
      render();
    });
  });

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadMemberCount();
  });

  window.FAMILY_ONBOARDING_API = { deriveSnapshot, getSnapshot };
  mount();
})();
