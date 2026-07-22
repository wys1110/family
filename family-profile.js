(() => {
  if (document.querySelector('[data-family-profile-module]')) return;

  const STORAGE_KEY = 'family-profile-display-v1';
  const MAX_NAME_LENGTH = 20;
  const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
  const PHOTO_SIZE = 360;
  const DEFAULT_PROFILE = Object.freeze({ dadName: '아빠', momName: '엄마', childNames: [], photoDataUrl: '' });

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

  const normalizePhoto = (value) => {
    const photo = String(value || '');
    return /^data:image\/(?:jpeg|png|webp);base64,/i.test(photo) ? photo : '';
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
      photoDataUrl: normalizePhoto(stored.photoDataUrl),
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
  let draftPhotoDataUrl = '';

  const renderPhoto = (profile = readProfile()) => {
    if (!settingsCard) return;
    const photo = normalizePhoto(profile.photoDataUrl);
    const image = settingsCard.querySelector('[data-family-profile-photo]');
    const placeholder = settingsCard.querySelector('[data-family-profile-photo-placeholder]');
    const removeButton = settingsCard.querySelector('[data-family-photo-remove]');
    if (!image || !placeholder || !removeButton) return;

    if (photo) {
      image.src = photo;
      image.hidden = false;
      placeholder.hidden = true;
      removeButton.hidden = false;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
      placeholder.hidden = false;
      removeButton.hidden = true;
    }
  };

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
      photoDataUrl: normalizePhoto(draftPhotoDataUrl),
    };
  };

  const loadImage = (file) => new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('선택한 사진을 열 수 없습니다.'));
    };
    image.src = objectUrl;
  });

  const compressSquarePhoto = async (file) => {
    if (!file?.type?.startsWith('image/')) throw new Error('사진 파일만 선택해 주세요.');
    if (file.size > MAX_PHOTO_BYTES) throw new Error('12MB 이하 사진을 선택해 주세요.');

    const image = await loadImage(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('사진 크기를 확인할 수 없습니다.');

    const sourceSize = Math.min(width, height);
    const sourceX = Math.max(0, (width - sourceSize) / 2);
    const sourceY = Math.max(0, (height - sourceSize) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('사진을 처리할 수 없습니다.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    const webp = canvas.toDataURL('image/webp', .82);
    if (webp.startsWith('data:image/webp')) return webp;
    return canvas.toDataURL('image/jpeg', .84);
  };

  const savePhoto = (photoDataUrl) => {
    const profile = { ...readProfile(), photoDataUrl: normalizePhoto(photoDataUrl) };
    writeProfile(profile);
    draftPhotoDataUrl = profile.photoDataUrl;
    renderPhoto(profile);
  };

  const installSettingsCard = () => {
    settingsView ||= document.querySelector('#settingsView');
    if (!settingsView || settingsCard) return;
    settingsCard = document.createElement('section');
    settingsCard.className = 'settings-card family-profile-settings';
    settingsCard.setAttribute('aria-labelledby', 'familyProfileSettingsTitle');
    settingsCard.innerHTML = `
      <div class="settings-heading family-profile-heading">
        <button class="settings-mark family-profile-photo-button" type="button" data-family-photo-trigger aria-label="가족 사진 선택">
          <img data-family-profile-photo alt="" hidden />
          <span class="family-profile-photo-placeholder" data-family-profile-photo-placeholder aria-hidden="true"></span>
          <i class="family-profile-photo-edit" aria-hidden="true"></i>
        </button>
        <div>
          <p class="eyebrow">가족 정보</p>
          <h2 id="familyProfileSettingsTitle">가족 이름</h2>
          <span>홈 카드에 표시할 이름과 사진을 설정하세요.</span>
        </div>
      </div>
      <form class="family-profile-form">
        <div class="family-profile-photo-control">
          <div>
            <strong>가족 사진</strong>
            <small>선택한 사진은 정사각형으로 자동 맞춤돼요.</small>
          </div>
          <div class="family-profile-photo-actions">
            <button type="button" data-family-photo-select>사진 선택</button>
            <button type="button" data-family-photo-remove hidden>사진 삭제</button>
          </div>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" data-family-photo-input hidden />
        </div>
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
    const photoInput = settingsCard.querySelector('[data-family-photo-input]');
    const selectPhotoButton = settingsCard.querySelector('[data-family-photo-select]');
    const photoTrigger = settingsCard.querySelector('[data-family-photo-trigger]');
    const removePhotoButton = settingsCard.querySelector('[data-family-photo-remove]');
    const openPhotoPicker = () => photoInput?.click();

    photoTrigger.addEventListener('click', openPhotoPicker);
    selectPhotoButton.addEventListener('click', openPhotoPicker);
    photoInput.addEventListener('change', async () => {
      const [file] = photoInput.files || [];
      photoInput.value = '';
      if (!file) return;

      selectPhotoButton.disabled = true;
      selectPhotoButton.setAttribute('aria-busy', 'true');
      try {
        const photoDataUrl = await compressSquarePhoto(file);
        savePhoto(photoDataUrl);
        if (typeof toast === 'function') toast('가족 사진을 저장했어요');
      } catch (error) {
        console.error('가족 사진 저장 실패', error);
        if (typeof toast === 'function') toast(error?.message || '가족 사진을 저장하지 못했어요');
      } finally {
        selectPhotoButton.disabled = false;
        selectPhotoButton.removeAttribute('aria-busy');
      }
    });

    removePhotoButton.addEventListener('click', () => {
      if (!window.confirm('가족 사진을 삭제할까요?')) return;
      try {
        savePhoto('');
        if (typeof toast === 'function') toast('가족 사진을 삭제했어요');
      } catch (error) {
        console.error('가족 사진 삭제 실패', error);
        if (typeof toast === 'function') toast('가족 사진을 삭제하지 못했어요');
      }
    });

    form.addEventListener('input', (event) => {
      if (event.target === photoInput) return;
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
        renderPhoto(profile);
        if (typeof toast === 'function') toast('가족 이름을 저장했어요');
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
    draftPhotoDataUrl = profile.photoDataUrl;
    settingsCard.querySelector('[name="familyDadName"]').value = profile.dadName;
    settingsCard.querySelector('[name="familyMomName"]').value = profile.momName;
    renderChildFields(profile);
    renderPreview(profile);
    renderPhoto(profile);
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
