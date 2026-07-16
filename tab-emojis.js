(() => {
  if (document.documentElement.dataset.tabEmojisModule === 'ready') return;
  document.documentElement.dataset.tabEmojisModule = 'ready';

  const labels = {
    calendar: '🗓️ 가족 캘린더',
    growth: '👶 성장일기',
    english: '📖 영어동화',
    'feature-request': '💡 기능 요청',
    settings: '⚙️ 설정',
  };

  const navigation = document.querySelector('.view-tabs');
  if (!navigation) return;

  const applyLabels = () => {
    navigation.querySelectorAll('.view-tab[data-view]').forEach((tab) => {
      const label = labels[tab.dataset.view];
      if (!label || tab.textContent === label) return;
      tab.textContent = label;
    });
  };

  applyLabels();
  new MutationObserver(applyLabels).observe(navigation, { childList: true });
})();
