(() => {
  if (document.documentElement.dataset.tabEmojisModule === 'ready') return;
  document.documentElement.dataset.tabEmojisModule = 'ready';

  const labels = {
    calendar: ['🗓️', '일정'],
    growth: ['🌱', '성장'],
    english: ['📖', '동화'],
    'feature-request': ['💡', '요청'],
    settings: ['🎨', '설정'],
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
})();
