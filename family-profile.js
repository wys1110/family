(() => {
  if (document.querySelector('[data-family-profile-module]')) return;

  const STORAGE_KEY = 'family-profile-display-v1';
  const MAX_NAME_LENGTH = 20;
  const DEFAULT_PROFILE = Object.freeze({ dadName: '아빠', momName: '엄마', childNames: [] });

  const heroStack = document.querySelector('.hero-card .family-stack');
  if (!heroStack) return;
  heroStack.dataset.familyProfileModule = '';

  const contextKey = () => {
    if (typeof state === 'undefined') return 'local';
    return state.household?.id || state.session?.user?.id || 'local';
  };

  const activeBabies = () => {
    if (typeof state === 'undefined' || !Array.isArray(state.babies)) return [];
    return state.babies.filter((baby) => !baby?.archivedAt);
  };

  const normalizeName = (value, fallback) => {
    const name = String(value || '').trim().slice(0, MAX_NAME_LENGTH);
    return name || fallback;
  };

  const readProfiles = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const readProfile = () => {
    const stored = readProfiles()[contextKey()] || {};
    return {
      dadName: normalizeName(stored.dadName, DEFAULT_PROFILE.dadName),
      momName: normalizeName(stored.momName, DEFAULT_PROFILE.momName),
      childNames: Array.isArray(stored.childNames)
        ? stored.childNames.map((name) => String(name || '').trim().slice(0, MAX_NAME_LENGTH))
        : [],
    };
  };

  const writeProfile = (profile) => {
    const profiles = readProfiles();
    profiles[contextKey()] = profile;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  };

  const childCount = () => Math.max(1, activeBabies().length);

  const defaultChildName = (index, count) => {
    const babyName = activeBabies()[index]?.name;
    if (babyName) return normalizeName(babyName, '아이');
    return count === 1 ? '아이' : `아이 ${index + 1}`;
  };

  const effectiveChildNames = (profile = readProfile()) => {
    const count = childCount();
    return Array.from({ length: count }, (_, index) => (
      normalizeName(profile.childNames[index], defaultChildName(index, count))
    ));
  };

  const createChip = (name, className) => {
    const chip = document.createElement('span');
    chip.className = `family-chip ${className}`;
    chip.textContent = name;
    return chip;
  };

  const renderHero = (draftProfile = null) => {
    const profile = draftProfile || readProfile();
    const fragment = document.createDocumentFragment();
    fragment.append(
      createChip(normalizeName(profile.dadName, '아빠'), 'dad'),
      createChip(normalizeName(profile.momName, '엄마'), 'mom'),
      ...effectiveChildNames(profile).map((name, index) => createChip(name, `baby baby-${index + 1}`)),
    );
    const names = [
      normalizeName(profile.dadName, '아빠'),
      normalizeName(profile.momName, '엄마'),
      ...effectiveChildNames(profile),
    ];
    heroStack.replaceChildren(fragment);
    heroStack.setAttribute('aria-label', `가족 구성원: ${names.join(', ')}`);
  };

  let settingsView = document.querySelector('#settingsView');
  let settingsCard = null;

  const renderChildFields = (profile = readProfile()) => {
    const fieldRoot = settingsCard?.querySelector('[data-family-child-fields]');
    if (!fieldRoot) return;
    const count = childCount();
    fieldRoot.replaceChildren(...Array.from({ length: count }, (_, index) => {
      const label = document.createElement('label');
      const fieldLabel = count === 1 ? '아이' : `아이 ${index + 1}`;
      label.className = 'family-profile-field';
      label.innerHTML = `${count === 1 ? '' : `<span>${fieldLabel}</span>`}<input type="text" maxlength="${MAX_NAME_LENGTH}" autocomplete="off" aria-label="${fieldLabel}" data-family-child-name="${index}" />`;
      const input = label.querySelector('input');
      input.value = normalizeName(profile.childNames[index], defaultChildName(index, count));
      input.placeholder = defaultChildName(index, count);
      return label;
    }));
  };

  const draftFromForm = () => {
    if (!settingsCard) return readProfile();
    const childInputs = [...settingsCard.querySelectorAll('[data-family-child-name]')];
    const count = childCount();
    return {
      dadName: normalizeName(settingsCard.querySelector('[name="familyDadName"]')?.value, '아빠'),
      momName: normalizeName(settingsCard.querySelector('[name="familyMomName"]')?.value, '엄마'),
      childNames: Array.from({ length: count }, (_, index) => (
        normalizeName(childInputs[index]?.value, defaultChildName(index, count))
      )),
    };
  };

  const installSettingsCard = () => {
    settingsView ||= document.querySelector('#settingsView');
    if (!settingsView || settingsCard) return;
    settingsCard = document.createElement('section');
    settingsCard.className = 'settings-card family-profile-settings';
    settingsCard.setAttribute('aria-labelledby', 'familyProfileSettingsTitle');
    settingsCard.innerHTML = `
      <div class="settings-heading family-profile-heading">
        <span class="settings-mark" aria-hidden="true">家</span>
        <div>
          <p class="eyebrow">가족 정보</p>
          <h2 id="familyProfileSettingsTitle">가족 이름</h2>
          <span>홈 카드에 표시할 이름을 입력하세요.</span>
        </div>
      </div>
      <form class="family-profile-form">
        <div class="family-profile-grid">
          <label class="family-profile-field"><span>아빠</span><input name="familyDadName" type="text" maxlength="${MAX_NAME_LENGTH}" autocomplete="off" placeholder="아빠" /></label>
          <label class="family-profile-field"><span>엄마</span><input name="familyMomName" type="text" maxlength="${MAX_NAME_LENGTH}" autocomplete="off" placeholder="엄마" /></label>
        </div>
        <div class="family-profile-children">
          <div class="family-profile-subheading"><strong>아이</strong><small>등록된 아기 수에 맞춰 자동으로 늘어나요.</small></div>
          <div class="family-profile-grid" data-family-child-fields></div>
        </div>
        <div class="family-profile-preview" aria-live="polite"><span>미리보기</span><div data-family-profile-preview></div></div>
        <button class="family-profile-save" type="submit">가족 이름 저장</button>
      </form>
    `;

    settingsView.insertBefore(settingsCard, settingsView.firstElementChild);

    const form = settingsCard.querySelector('form');
    form.addEventListener('input', () => {
      const draft = draftFromForm();
      renderHero(draft);
      renderPreview(draft);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const profile = draftFromForm();
      try {
        writeProfile(profile);
        renderHero(profile);
        renderPreview(profile);
        if (typeof toast === 'function') toast('가족 이름을 저장했어요 👨‍👩‍👧');
      } catch (error) {
        console.error('가족 이름 저장 실패', error);
        if (typeof toast === 'function') toast('가족 이름을 저장하지 못했어요');
      }
    });
  };

  const renderPreview = (profile = readProfile()) => {
    const preview = settingsCard?.querySelector('[data-family-profile-preview]');
    if (!preview) return;
    const names = [
      normalizeName(profile.dadName, '아빠'),
      normalizeName(profile.momName, '엄마'),
      ...effectiveChildNames(profile),
    ];
    preview.replaceChildren(...names.map((name) => {
      const chip = document.createElement('span');
      chip.textContent = name;
      return chip;
    }));
  };

  const renderSettings = () => {
    installSettingsCard();
    if (!settingsCard) return;
    const profile = readProfile();
    settingsCard.querySelector('[name="familyDadName"]').value = profile.dadName;
    settingsCard.querySelector('[name="familyMomName"]').value = profile.momName;
    renderChildFields(profile);
    renderPreview(profile);
  };

  const sync = () => {
    renderHero();
    renderSettings();
  };

  const babySelector = document.querySelector('#babySelector');
  if (babySelector) {
    new MutationObserver(() => sync()).observe(babySelector, { childList: true, subtree: true, characterData: true });
  }

  window.addEventListener('familycontextchange', sync);
  window.addEventListener('storage', (event) => { if (event.key === STORAGE_KEY) sync(); });
  sync();

  let settingsAttempts = 0;
  const settingsRetry = window.setInterval(() => {
    if (settingsCard || settingsAttempts >= 40) {
      window.clearInterval(settingsRetry);
      return;
    }
    settingsAttempts += 1;
    renderSettings();
  }, 100);
})();
