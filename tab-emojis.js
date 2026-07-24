(() => {
  if (document.documentElement.dataset.tabEmojisModule === 'ready') return;
  document.documentElement.dataset.tabEmojisModule = 'ready';

  const labels = {
    calendar: ['🗓️', '일정'],
    growth: ['🌱', '성장'],
    language: ['🌍', '언어'],
    english: ['📖', '동화'],
    'feature-request': ['💡', '요청'],
    settings: ['⚙️', '설정'],
  };

  const navigation = document.querySelector('.view-tabs');
  if (!navigation) return;
  navigation.setAttribute('role', 'tablist');

  const applyLabels = () => {
    navigation.querySelectorAll('.view-tab[data-view]').forEach((tab) => {
      const label = labels[tab.dataset.view];
      if (label) {
        const [icon, text] = label;
        const iconNode = tab.querySelector(':scope > .view-tab-icon');
        const labelNode = tab.querySelector(':scope > .view-tab-label');
        if (!iconNode || !labelNode || iconNode.textContent !== icon || labelNode.textContent !== text) {
          tab.replaceChildren();
          const nextIcon = document.createElement('span');
          nextIcon.className = 'view-tab-icon';
          nextIcon.setAttribute('aria-hidden', 'true');
          nextIcon.textContent = icon;
          const nextLabel = document.createElement('span');
          nextLabel.className = 'view-tab-label';
          nextLabel.textContent = text;
          tab.append(nextIcon, nextLabel);
        }
        tab.setAttribute('aria-label', text);
      }
      const active = tab.classList.contains('active');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(active));
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
  };

  applyLabels();
  new MutationObserver(applyLabels).observe(navigation, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  const installStylesheet = (name, href) => {
    if (document.querySelector(`link[data-module="${name}"]`)) return;
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = href;
    stylesheet.dataset.module = name;
    document.head.appendChild(stylesheet);
  };

  const installWritingModule = () => {
    installStylesheet('language-writing', 'language-writing.css?v=20260724-writing-v2');
    if (document.querySelector('script[data-module="language-writing"]')) return;
    const script = document.createElement('script');
    script.src = 'language-writing.js?v=20260724-writing-v2';
    script.dataset.module = 'language-writing';
    script.async = false;
    script.onerror = () => console.error('언어 쓰기 연습 모듈을 불러오지 못했어요');
    document.body.appendChild(script);
  };

  installStylesheet('language-practice', 'language-practice.css?v=20260724-multilingual-v1');
  const existingLanguageScript = document.querySelector('script[data-module="language-practice"]');
  if (existingLanguageScript) {
    if (document.documentElement.dataset.languagePracticeModule === 'ready') installWritingModule();
    else existingLanguageScript.addEventListener('load', installWritingModule, { once: true });
  } else {
    const script = document.createElement('script');
    script.src = 'language-practice.js?v=20260724-multilingual-v1';
    script.dataset.module = 'language-practice';
    script.async = false;
    script.onload = installWritingModule;
    script.onerror = () => console.error('언어 연습 모듈을 불러오지 못했어요');
    document.body.appendChild(script);
  }
})();
