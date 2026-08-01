(() => {
  if (document.documentElement.dataset.englishStoryNameModule === 'ready') return;
  document.documentElement.dataset.englishStoryNameModule = 'ready';

  const navigation = document.querySelector('.view-tabs');

  const installEnglishStoryNameEditor = () => {
    const view = document.querySelector('#englishView');
    if (!view || view.dataset.storyNameEditor === 'ready') return false;
    view.dataset.storyNameEditor = 'ready';

    const STORAGE_PREFIX = 'family-english-story-baby-name-v2';
    const textTemplates = new WeakMap();
    const renderedText = new WeakMap();
    const trackedTextNodes = new Set();
    let hasCustomNames = false;

    const safeState = () => {
      try {
        return typeof state !== 'undefined' ? state : null;
      } catch {
        return null;
      }
    };

    const currentUserId = () => safeState()?.session?.user?.id || 'device';
    const storageKey = () => {
      const key = `${STORAGE_PREFIX}:${currentUserId()}`;
      return window.FAMILY_DEMO?.storageKey?.(key) || key;
    };

    const cleanName = (value, fallback = '') => {
      const cleaned = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 30);
      return cleaned || fallback;
    };

    const activeBabyName = () => {
      const appState = safeState();
      const activeBaby = appState?.babies?.find((baby) => baby.id === appState.activeBabyId);
      return cleanName(activeBaby?.name || appState?.babies?.[0]?.name, '도윤');
    };

    const romanizeHangul = (value) => {
      const initials = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
      const vowels = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
      const finals = ['', 'k', 'k', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'p', 'ps', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 'h'];
      const romanized = Array.from(cleanName(value))
        .map((character) => {
          const syllable = character.charCodeAt(0) - 0xac00;
          if (syllable < 0 || syllable > 11171) return /[a-z0-9]/i.test(character) ? character : character === ' ' ? '-' : '';
          const initial = Math.floor(syllable / 588);
          const vowel = Math.floor((syllable % 588) / 28);
          const final = syllable % 28;
          return `${initials[initial]}${vowels[vowel]}${finals[final]}`;
        })
        .join('')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      return romanized ? romanized.charAt(0).toUpperCase() + romanized.slice(1) : 'Baby';
    };

    const profileNames = () => {
      const korean = activeBabyName();
      return { korean, english: romanizeHangul(korean) };
    };

    const readNames = () => {
      const defaults = profileNames();
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey()) || 'null');
        if (!saved) {
          hasCustomNames = false;
          return defaults;
        }
        hasCustomNames = true;
        return {
          korean: cleanName(saved.korean, defaults.korean),
          english: cleanName(saved.english, defaults.english),
        };
      } catch {
        hasCustomNames = false;
        return defaults;
      }
    };

    let names = readNames();

    const hasBatchim = (value) => {
      const lastHangul = Array.from(cleanName(value)).reverse().find((character) => /[가-힣]/.test(character));
      if (!lastHangul) return false;
      return (lastHangul.charCodeAt(0) - 0xac00) % 28 !== 0;
    };

    const personalizeText = (value) => {
      const korean = names.korean;
      const english = names.english;
      const consonantEnding = hasBatchim(korean);
      return String(value)
        .replace(/\bDoyun\b/g, english)
        .replaceAll('도윤이에게', consonantEnding ? `${korean}이에게` : `${korean}에게`)
        .replaceAll('도윤이와', consonantEnding ? `${korean}이와` : `${korean}와`)
        .replaceAll('도윤이는', consonantEnding ? `${korean}이는` : `${korean}는`)
        .replaceAll('도윤이가', consonantEnding ? `${korean}이가` : `${korean}가`)
        .replaceAll('도윤아', consonantEnding ? `${korean}아` : `${korean}야`)
        .replaceAll('도윤이', consonantEnding ? `${korean}이` : korean)
        .replaceAll('도윤', korean);
    };

    const containsStoryNameTemplate = (value) => /\bDoyun\b|도윤/.test(String(value));

    const processTextNode = (node) => {
      if (!(node instanceof Text) || node.parentElement?.closest('[data-story-name-ui]')) return;
      const current = node.nodeValue || '';
      if (current === renderedText.get(node)) return;
      if (containsStoryNameTemplate(current)) {
        textTemplates.set(node, current);
        trackedTextNodes.add(node);
      } else if (!textTemplates.has(node)) {
        return;
      } else {
        textTemplates.delete(node);
        renderedText.delete(node);
        trackedTextNodes.delete(node);
        return;
      }
      const next = personalizeText(textTemplates.get(node));
      renderedText.set(node, next);
      if (current !== next) node.nodeValue = next;
    };

    const scan = (root) => {
      if (root instanceof Text) {
        processTextNode(root);
        return;
      }
      if (!(root instanceof Element) || root.matches('[data-story-name-ui]')) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) processTextNode(node);
    };

    const rerenderTrackedText = () => {
      trackedTextNodes.forEach((node) => {
        if (!node.isConnected || !textTemplates.has(node)) {
          trackedTextNodes.delete(node);
          return;
        }
        const next = personalizeText(textTemplates.get(node));
        renderedText.set(node, next);
        node.nodeValue = next;
      });
    };

    const style = document.createElement('style');
    style.dataset.storyNameUi = '';
    style.textContent = `
      .english-name-editor{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:.7rem;margin:-.15rem 0 .9rem;padding:.72rem .82rem;border:1px solid rgba(77,95,81,.12);border-radius:1rem;color:var(--label,#344139);background:var(--surface,#fff);box-shadow:0 .3rem 1rem rgba(49,65,53,.05);text-align:left}
      .english-name-editor>span:first-child{width:2.45rem;height:2.45rem;display:grid;place-items:center;border-radius:.78rem;background:rgba(111,148,121,.13);font-size:1.15rem}
      .english-name-editor div{min-width:0}.english-name-editor small,.english-name-editor strong{display:block}.english-name-editor small{margin-bottom:.12rem;color:var(--secondary,#7c8b7c);font-size:.68rem;font-weight:750}.english-name-editor strong{overflow:hidden;font-size:.86rem;text-overflow:ellipsis;white-space:nowrap}.english-name-editor i{color:var(--blue,#4b78a8);font-size:.74rem;font-style:normal;font-weight:800}
      .english-name-dialog{width:min(29rem,calc(100vw - 2rem));padding:0;border:0;border-radius:1.25rem;color:var(--label,#344139);background:var(--surface,#fff);box-shadow:0 1.4rem 4rem rgba(12,25,38,.28)}
      .english-name-dialog::backdrop{background:rgba(5,13,28,.56);backdrop-filter:blur(3px)}
      .english-name-dialog form{display:grid;gap:.9rem;padding:1.15rem}.english-name-dialog header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.english-name-dialog h2{margin:0;font-size:1.18rem}.english-name-dialog header p{margin:.25rem 0 0;color:var(--secondary,#7c8b7c);font-size:.78rem;line-height:1.45}.english-name-dialog .english-name-close{width:2.25rem;height:2.25rem;border:0;border-radius:.72rem;color:var(--secondary,#667);background:rgba(127,145,173,.12);font-size:1.2rem}
      .english-name-dialog label{display:grid;gap:.35rem;color:var(--secondary,#667);font-size:.76rem;font-weight:800}.english-name-dialog input{width:100%;min-height:2.9rem;padding:.7rem .78rem;border:1px solid var(--separator,rgba(77,95,81,.16));border-radius:.8rem;color:var(--label,#26332b);background:var(--surface-2,#f8faf7);font:inherit;font-size:1rem;outline:none}.english-name-dialog input:focus{border-color:var(--blue,#6f9479);box-shadow:0 0 0 3px rgba(111,148,121,.14)}
      .english-name-dialog .english-name-preview{margin:0;padding:.72rem .8rem;border-radius:.8rem;color:var(--secondary,#667);background:rgba(111,148,121,.1);font-size:.75rem;line-height:1.45}.english-name-dialog .english-name-preview strong{color:var(--label,#344139)}
      .english-name-dialog footer{display:grid;grid-template-columns:1fr auto auto;gap:.45rem}.english-name-dialog footer button{min-height:2.65rem;padding:.55rem .72rem;border:0;border-radius:.78rem;font-weight:800}.english-name-dialog .english-name-profile{color:var(--blue,#4b78a8);background:rgba(75,120,168,.1)}.english-name-dialog .english-name-cancel{color:var(--secondary,#667);background:rgba(127,145,173,.1)}.english-name-dialog .english-name-save{color:#fff;background:var(--blue,#4f7fae)}
      html[data-family-theme="night"] .english-name-editor{border-color:rgba(134,175,255,.18);background:linear-gradient(145deg,rgba(18,39,67,.96),rgba(11,27,49,.98));box-shadow:0 10px 28px rgba(0,0,0,.2)}
      html[data-family-theme="night"] .english-name-editor>span:first-child{background:rgba(121,170,255,.14)}
      html[data-family-theme="night"] .english-name-dialog{border:1px solid rgba(134,175,255,.18);background:#0d1c33}
      html[data-family-theme="night"] .english-name-dialog input{border-color:rgba(134,175,255,.2);background:#142746}
      @media(max-width:390px){.english-name-dialog footer{grid-template-columns:1fr 1fr}.english-name-dialog .english-name-profile{grid-column:1/-1}.english-name-editor{gap:.55rem}.english-name-editor i{font-size:.7rem}}
    `;
    document.head.appendChild(style);

    const editor = document.createElement('button');
    editor.type = 'button';
    editor.className = 'english-name-editor';
    editor.dataset.storyNameUi = '';
    editor.setAttribute('aria-haspopup', 'dialog');
    editor.innerHTML = '<span aria-hidden="true">👶</span><div><small>동화 속 아기 이름</small><strong></strong></div><i>수정 ›</i>';
    view.querySelector('.english-page-header')?.insertAdjacentElement('afterend', editor);

    const dialog = document.createElement('dialog');
    dialog.className = 'english-name-dialog';
    dialog.dataset.storyNameUi = '';
    dialog.innerHTML = `
      <form>
        <header><div><h2>동화 속 아기 이름</h2><p>제목, 문장, 영어 음성에 함께 적용돼요.</p></div><button type="button" class="english-name-close" aria-label="닫기">×</button></header>
        <label>한글 이름<input name="koreanName" maxlength="30" autocomplete="off" required></label>
        <label>영문 이름<input name="englishName" maxlength="30" autocomplete="off" inputmode="text" required></label>
        <p class="english-name-preview">미리보기: <strong></strong></p>
        <footer><button type="button" class="english-name-profile">아기 프로필 이름 사용</button><button type="button" class="english-name-cancel">취소</button><button type="submit" class="english-name-save">저장</button></footer>
      </form>`;
    document.body.appendChild(dialog);

    const form = dialog.querySelector('form');
    const koreanInput = form.elements.koreanName;
    const englishInput = form.elements.englishName;
    const preview = dialog.querySelector('.english-name-preview strong');
    const editorName = editor.querySelector('strong');

    const updateNameUi = () => {
      editorName.textContent = `${names.korean} · ${names.english}`;
      editor.setAttribute('aria-label', `동화 속 이름 ${names.korean}, 수정`);
      preview.textContent = personalizeText('Doyun and the Tiny Star · 도윤이와 작은 별');
    };

    const openDialog = () => {
      koreanInput.value = names.korean;
      englishInput.value = names.english;
      updateNameUi();
      dialog.showModal();
      window.setTimeout(() => koreanInput.focus(), 30);
    };

    const closeDialog = () => dialog.open && dialog.close();

    const saveNames = (nextNames, customized = true) => {
      names = {
        korean: cleanName(nextNames.korean, profileNames().korean),
        english: cleanName(nextNames.english, romanizeHangul(nextNames.korean || profileNames().korean)),
      };
      hasCustomNames = customized;
      try {
        if (customized) localStorage.setItem(storageKey(), JSON.stringify(names));
        else localStorage.removeItem(storageKey());
      } catch { /* 현재 화면에는 계속 적용 */ }
      updateNameUi();
      rerenderTrackedText();
    };

    const updatePreviewFromInputs = () => {
      const korean = cleanName(koreanInput.value, names.korean);
      const english = cleanName(englishInput.value, romanizeHangul(korean));
      const previousNames = names;
      names = { korean, english };
      preview.textContent = personalizeText('Doyun and the Tiny Star · 도윤이와 작은 별');
      names = previousNames;
    };

    editor.addEventListener('click', openDialog);
    dialog.querySelector('.english-name-close').addEventListener('click', closeDialog);
    dialog.querySelector('.english-name-cancel').addEventListener('click', closeDialog);
    dialog.querySelector('.english-name-profile').addEventListener('click', () => {
      saveNames(profileNames(), false);
      closeDialog();
    });
    koreanInput.addEventListener('input', () => {
      if (!englishInput.dataset.userEdited) englishInput.value = romanizeHangul(koreanInput.value);
      updatePreviewFromInputs();
    });
    englishInput.addEventListener('input', () => {
      englishInput.dataset.userEdited = 'true';
      updatePreviewFromInputs();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveNames({ korean: koreanInput.value, english: englishInput.value });
      closeDialog();
    });
    dialog.addEventListener('close', () => {
      delete englishInput.dataset.userEdited;
    });

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') processTextNode(mutation.target);
        mutation.addedNodes.forEach(scan);
      });
    });
    observer.observe(view, { childList: true, subtree: true, characterData: true });
    scan(view);
    updateNameUi();

    if (typeof window.SpeechSynthesisUtterance === 'function' && !window.SpeechSynthesisUtterance.__familyNamePersonalized) {
      const NativeUtterance = window.SpeechSynthesisUtterance;
      const PersonalizedUtterance = function (text = '') {
        return new NativeUtterance(personalizeText(String(text)));
      };
      PersonalizedUtterance.prototype = NativeUtterance.prototype;
      Object.setPrototypeOf(PersonalizedUtterance, NativeUtterance);
      PersonalizedUtterance.__familyNamePersonalized = true;
      window.SpeechSynthesisUtterance = PersonalizedUtterance;
    }

    const syncWithFamilyContext = () => {
      names = readNames();
      updateNameUi();
      rerenderTrackedText();
      window.setTimeout(() => scan(view), 0);
    };

    window.addEventListener('familycontextchange', syncWithFamilyContext);
    navigation?.addEventListener('click', (event) => {
      if (!event.target.closest('[data-view="english"]')) return;
      window.setTimeout(() => {
        if (!hasCustomNames) names = profileNames();
        updateNameUi();
        rerenderTrackedText();
        scan(view);
      }, 0);
    });

    return true;
  };

  if (!installEnglishStoryNameEditor()) {
    const installObserver = new MutationObserver(() => {
      if (!installEnglishStoryNameEditor()) return;
      installObserver.disconnect();
    });
    installObserver.observe(document.body, { childList: true, subtree: true });
  }
})();
