(() => {
  const install = () => {
    const mark = document.querySelector('.family-profile-heading .settings-mark');
    if (!mark) return false;
    if (mark.dataset.familyProfileMascot === 'true') return true;

    mark.dataset.familyProfileMascot = 'true';
    mark.classList.add('family-profile-mascot');
    mark.textContent = '';
    mark.innerHTML = `
      <span class="family-profile-mascot-family" aria-hidden="true">👨‍👩‍👦</span>
      <span class="family-profile-mascot-heart" aria-hidden="true">♥</span>
    `;
    return true;
  };

  if (install()) return;
  let attempts = 0;
  const retry = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 40) window.clearInterval(retry);
  }, 100);
})();
