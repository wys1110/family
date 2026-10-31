(() => {
  const list = document.querySelector('#growthList');
  if (!list) return;
  const width = 76;
  let opened = null, drag = null, suppress = null;
  function reveal(wrapper, show) {
    if (!wrapper) return;
    if (show && opened && opened !== wrapper) reveal(opened, false);
    wrapper.classList.toggle('is-open', show);
    wrapper.style.setProperty('--swipe-offset', `${show ? -width : 0}px`);
    const remove = wrapper.querySelector('.growth-swipe-delete');
    remove.tabIndex = show ? 0 : -1;
    remove.setAttribute('aria-hidden', String(!show));
    if (show) opened = wrapper;
    else if (opened === wrapper) opened = null;
  }
  function enhance() {
    opened = null; drag = null;
    list.querySelectorAll('.growth-entry').forEach(row => {
      if (row.parentElement.classList.contains('growth-swipe-row')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'growth-swipe-row';
      row.before(wrapper); wrapper.append(row);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'growth-swipe-delete danger-button';
      remove.dataset.delete = 'growth'; remove.textContent = '삭제';
      remove.tabIndex = -1; remove.setAttribute('aria-hidden', 'true');
      remove.setAttribute('aria-label', `${row.querySelector('.growth-body strong')?.textContent || '성장 기록'} 삭제`);
      remove.addEventListener('click', async () => {
        if (remove.disabled) return;
        remove.disabled = true;
        try {
          await window.FAMILY_DELETE_GROWTH_ENTRY(row.dataset.id, {
            x: window.scrollX, y: window.scrollY, view: state.activeView,
            babyId: state.activeBabyId, householdId: state.household?.id, userId: state.session?.user?.id,
          });
        } finally { remove.disabled = false; }
      });
      wrapper.append(remove);
    });
  }
  list.addEventListener('pointerdown', event => {
    const row = event.target.closest('.growth-entry');
    if (!row || event.isPrimary === false || event.button > 0) return;
    const wrapper = row.parentElement;
    drag = { row, wrapper, id: event.pointerId, x: event.clientX, y: event.clientY, offset: opened === wrapper ? -width : 0, axis: null, value: opened === wrapper ? -width : 0 };
  });
  list.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
      drag.axis = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'x' : 'y';
      if (drag.axis === 'x') {
        if (opened && opened !== drag.wrapper) reveal(opened, false);
        drag.row.setPointerCapture(event.pointerId);
        drag.wrapper.classList.add('is-dragging');
      }
    }
    if (drag.axis !== 'x') return;
    event.preventDefault();
    drag.value = Math.max(-width, Math.min(0, drag.offset + dx));
    drag.wrapper.style.setProperty('--swipe-offset', `${drag.value}px`);
  });
  function finish(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.axis === 'x') {
      suppress = { row: drag.row, until: Date.now() + 500 };
      reveal(drag.wrapper, event.type === 'pointercancel' ? drag.offset < 0 : drag.value < -width / 2);
    }
    drag.wrapper.classList.remove('is-dragging'); drag = null;
  }
  list.addEventListener('pointerup', finish);
  list.addEventListener('pointercancel', finish);
  list.addEventListener('click', event => {
    if (suppress && Date.now() < suppress.until && suppress.row.contains(event.target)) {
      event.preventDefault(); event.stopImmediatePropagation(); suppress = null;
    }
  }, true);
  list.addEventListener('keydown', event => {
    const wrapper = event.target.closest('.growth-swipe-row');
    if (!wrapper) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); reveal(wrapper, true); wrapper.querySelector('.growth-swipe-delete').focus(); }
    if (event.key === 'ArrowRight' || event.key === 'Escape') { event.preventDefault(); reveal(wrapper, false); wrapper.querySelector('.growth-entry').focus(); }
  });
  document.addEventListener('pointerdown', event => { if (opened && !opened.contains(event.target)) reveal(opened, false); });
  const hint = document.createElement('p');
  hint.className = 'growth-swipe-hint'; hint.textContent = '기록을 왼쪽으로 밀면 삭제 · 키보드 ←';
  list.before(hint);
  const previous = renderGrowthList;
  renderGrowthList = Object.assign(function (...args) { const result = previous.apply(this, args); enhance(); return result; }, previous);
  enhance();
})();
