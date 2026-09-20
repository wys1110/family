(() => {
  const root = document.documentElement;
  if (root.dataset.novaReady) return;
  root.dataset.novaReady = 'true';
  const brand = document.querySelector('.topbar > div:first-child');
  if (brand) {
    const mark = document.createElement('span'); mark.className = 'nova-brand-mark'; mark.setAttribute('aria-hidden', 'true');
    brand.prepend(mark);
  }
  const quick = document.querySelector('#careTimerCard .growth-quick-grid');
  quick?.querySelectorAll('button').forEach(button => {
    const symbol = button.querySelector('.quick-symbol');
    if (symbol) symbol.setAttribute('aria-hidden', 'true');
  });
  // Keep theme selection behavior and storage keys; only the visual descriptions change.
  const descriptions = {white:'아이보리와 은은한 라벤더', black:'깊은 네이비와 부드러운 라벤더'};
  document.querySelectorAll('[data-theme-option]').forEach(button => {
    const copy = button.querySelector('.theme-option-copy small');
    if (copy) copy.textContent = descriptions[button.dataset.themeOption] || copy.textContent;
  });
  const syncBrowserColor = () => {
    const color = getComputedStyle(root).getPropertyValue('--nova-bg').trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  };
  new MutationObserver(syncBrowserColor).observe(root, {attributes:true, attributeFilter:['data-family-theme-choice']});
  syncBrowserColor();
})();
