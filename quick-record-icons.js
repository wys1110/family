(() => {
  const root = document.querySelector("#growthView");
  if (!root || document.documentElement.dataset.quickRecordIconsBound === "true") return;

  document.documentElement.dataset.quickRecordIconsBound = "true";

  const diaperSvg = `
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M7 11.5h18v3.1c0 6.7-3.4 11.1-9 12.2-5.6-1.1-9-5.5-9-12.2v-3.1Z" fill="#fffdfb" stroke="#aeb7c0" stroke-width="1.25" stroke-linejoin="round"/>
      <rect x="7" y="8.2" width="18" height="6.2" rx="2.1" fill="#f6f7f8" stroke="#aeb7c0" stroke-width="1.25"/>
      <path d="M8.1 14.6c3.2.4 5.4 2.8 5.9 6.6M23.9 14.6c-3.2.4-5.4 2.8-5.9 6.6" fill="none" stroke="#d2d7dc" stroke-width="1.2" stroke-linecap="round"/>
      <rect x="4.4" y="11" width="4.6" height="6.1" rx="1.2" fill="#55bde7" stroke="#439fc6" stroke-width=".8"/>
      <rect x="23" y="11" width="4.6" height="6.1" rx="1.2" fill="#55bde7" stroke="#439fc6" stroke-width=".8"/>
      <path d="M12.3 24.7c1.1.55 2.35.85 3.7.85s2.6-.3 3.7-.85" fill="none" stroke="#c9cfd5" stroke-width="1.1" stroke-linecap="round"/>
    </svg>
  `;

  if (!document.querySelector('style[data-module="quick-record-icons"]')) {
    const style = document.createElement("style");
    style.dataset.module = "quick-record-icons";
    style.textContent = `
      #growthView .quick-symbol.quick-record-emoji {
        font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif !important;
        font-size: 22px !important;
        line-height: 1;
      }
      #growthView .quick-symbol.quick-record-diaper svg {
        display: block;
        width: 25px;
        height: 25px;
      }
    `;
    document.head.appendChild(style);
  }

  let syncQueued = false;

  const syncIcons = () => {
    syncQueued = false;

    const feedingSymbol = root.querySelector('[data-growth-quick="수유·이유식"] .quick-symbol');
    if (feedingSymbol && feedingSymbol.dataset.quickRecordIcon !== "feeding-v1") {
      feedingSymbol.textContent = "🍼";
      feedingSymbol.classList.add("quick-record-emoji");
      feedingSymbol.setAttribute("aria-hidden", "true");
      feedingSymbol.dataset.quickRecordIcon = "feeding-v1";
    }

    const diaperSymbol = root.querySelector('[data-growth-quick="기저귀"] .quick-symbol');
    if (diaperSymbol && diaperSymbol.dataset.quickRecordIcon !== "diaper-v1") {
      diaperSymbol.innerHTML = diaperSvg;
      diaperSymbol.classList.add("quick-record-diaper");
      diaperSymbol.setAttribute("aria-hidden", "true");
      diaperSymbol.dataset.quickRecordIcon = "diaper-v1";
    }
  };

  const queueSync = () => {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(syncIcons);
  };

  new MutationObserver(queueSync).observe(root, { childList: true, subtree: true });
  syncIcons();
})();
