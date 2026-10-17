import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.className = '';
    this.classList = {
      add: (...names) => names.forEach((name) => { if (!this.className.split(' ').includes(name)) this.className = `${this.className} ${name}`.trim(); }),
      remove: (...names) => { this.className = this.className.split(' ').filter((name) => !names.includes(name)).join(' '); },
      contains: (name) => this.className.split(' ').includes(name),
      toggle: (name, force) => {
        const add = force ?? !this.classList.contains(name);
        this.classList[add ? 'add' : 'remove'](name);
        return add;
      },
    };
  }
  set innerHTML(value) {
    if (value.includes('class="settings-card"')) {
      const card = new Element('section'); card.className = 'settings-card';
      card.textContent = '화면 테마 취향에 맞게 바꿔보세요.';
      card.querySelector = (selector) => selector === 'h1, h2, h3, h4' ? { textContent: '화면 테마' } : null;
      this.appendChild(card);
    }
  }
  get firstElementChild() { return this.children[0] || null; }
  get textContent() { return this._textContent || this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  insertBefore(child, before) { child.parentElement = this; const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, child); return child; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  dispatch(type) { for (const callback of this.listeners[type] || []) callback({ target: this }); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  findDescendant(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.findDescendant(predicate);
      if (nested) return nested;
    }
    return null;
  }
  findAll(predicate) {
    return this.children.flatMap((child) => [
      ...(predicate(child) ? [child] : []),
      ...child.findAll(predicate),
    ]);
  }
  querySelector(selector) {
    if (selector === '.settings-heading') return this.heading || null;
    if (selector === '[data-settings-search-input]') return this.findDescendant((child) => child.dataset.settingsSearchInput !== undefined);
    if (selector === '[data-settings-search-status]') return this.findDescendant((child) => child.dataset.settingsSearchStatus !== undefined);
    if (selector === '[data-settings-search-reset]') return this.findDescendant((child) => child.dataset.settingsSearchReset !== undefined);
    if (selector === '[data-settings-search-jumps]') return this.findDescendant((child) => child.dataset.settingsSearchJumps !== undefined);
    return null;
  }
  querySelectorAll(selector) {
    if (selector === '[data-theme-option]') return [];
    if (selector === '.settings-card') return this.children.filter((child) => child.classList.contains('settings-card'));
    if (selector === '.view-tab') return this.children.filter((child) => child.dataset.view !== undefined);
    if (selector === '[data-settings-search-jumps] button') {
      const jumps = this.querySelector('[data-settings-search-jumps]');
      return jumps?.findAll((child) => child.tagName === 'BUTTON') || [];
    }
    return [];
  }
  scrollIntoView() { this.scrolled = true; }
  focus() { this.focused = true; }
}

const runSettings = () => {
  const main = new Element('main');
  const navigation = new Element('nav');
  const tabs = [];
  navigation.querySelector = (selector) => selector.includes('data-view') ? tabs.find((tab) => selector.includes(tab.dataset.view)) || null : null;
  navigation.appendChild = (tab) => { tabs.push(tab); return Element.prototype.appendChild.call(navigation, tab); };
  const windowListeners = {};
  const observer = { observe() {} };
  const document = {
    documentElement: { dataset: {}, style: {} },
    querySelector: (selector) => selector === '.app-shell main' ? main : selector === '.view-tabs' ? navigation : null,
    querySelectorAll: (selector) => selector === '.view-tab' ? tabs : [],
    getElementById: () => null,
    createElement: (tag) => {
      const element = new Element(tag);
      if (tag === 'div') element.heading = new Element('div');
      return element;
    },
  };
  const window = {
    FAMILY_DEMO_MODE: false,
    addEventListener: (type, callback) => { (windowListeners[type] ||= []).push(callback); },
    dispatchEvent() {},
  };
  const storage = { getItem: () => null, setItem() {} };
  const getComputedStyle = (element) => ({ display: element.hidden || element.classList.contains('permission-hidden') || element.classList.contains('settings-search-hidden') ? 'none' : 'block' });
  const context = {
    document, window, localStorage: storage, state: { activeView: 'calendar' },
    switchView: () => {}, toast() {}, CustomEvent: class {}, MutationObserver: class { constructor(callback) { this.trigger = callback; observer.trigger = callback; } observe() { observer.observe(); } },
    setTimeout: () => {},
  };
  window.switchView = context.switchView;
  new Function('ACTIVE_VIEW_KEY', 'window', 'document', 'localStorage', 'state', 'switchView', 'toast', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'setTimeout', readFileSync('settings.js', 'utf8'))(
    'family-active-view-v1', window, document, storage, context.state, context.switchView, context.toast, context.CustomEvent, context.MutationObserver, getComputedStyle, context.setTimeout,
  );
  const view = main.children.find((child) => child.id === 'settingsView');
  return { view, window, windowListeners, observer };
};

describe('settings search', () => {
  test('matches card text, refreshes late cards, clears, jumps, and preserves hidden cards', () => {
    const { view, observer } = runSettings();
    const search = view.querySelector('[data-settings-search-input]');
    expect(search).toBeTruthy();
    const themeCard = view.querySelectorAll('.settings-card')[0];

    const hidden = new Element('section');
    hidden.className = 'settings-card permission-hidden'; hidden.hidden = true; hidden.textContent = 'Excel 보고서';
    hidden.querySelector = (selector) => selector === 'h1, h2, h3, h4' ? { textContent: 'Excel 보고서' } : null;
    view.appendChild(hidden);
    const prepended = new Element('section');
    prepended.className = 'settings-card family-profile-settings'; prepended.textContent = '가족 프로필과 이름';
    prepended.querySelector = (selector) => selector === 'h1, h2, h3, h4' ? { textContent: '가족 이름' } : null;
    view.insertBefore(prepended, themeCard);
    const late = new Element('section');
    late.className = 'settings-card settings-family-space-card'; late.textContent = '가족 공간 초대 링크와 구성원';
    late.querySelector = (selector) => selector === 'h1, h2, h3, h4' ? { textContent: '가족 구성원' } : null;
    view.appendChild(late);
    observer.trigger?.([{ type: 'childList', target: view, addedNodes: [hidden, prepended, late], removedNodes: [] }]);
    expect(view.firstElementChild).toBe(view.querySelector('[data-settings-search-input]').parentElement);

    search.value = '가족'; search.dispatch('input');
    const familyRows = view.querySelectorAll('[data-settings-search-jumps] button');
    expect(familyRows.map((row) => row.textContent)).toEqual(['가족 이름', '가족 구성원']);
    expect(view.querySelector('[data-settings-search-jumps]').findAll((node) => node.tagName === 'H3').map((heading) => heading.textContent)).toEqual(['가족']);
    expect(late.classList.contains('settings-search-hidden')).toBe(false);
    expect(themeCard.classList.contains('settings-search-hidden')).toBe(true);
    expect(hidden.hidden).toBe(true);
    expect(hidden.classList.contains('settings-search-hidden')).toBe(false);
    const jump = familyRows.find((row) => row.textContent === '가족 구성원');
    expect(jump.textContent).toBe('가족 구성원');
    jump.dispatch('click');
    expect(late.scrolled).toBe(true);
    expect(late.focused).toBe(true);

    search.value = '아무것도 없음'; search.dispatch('input');
    expect(view.querySelector('[data-settings-search-status]').textContent).toContain('0');
    view.querySelector('[data-settings-search-reset]').dispatch('click');
    expect(search.value).toBe('');
    expect(themeCard.classList.contains('settings-search-hidden')).toBe(false);
    expect(hidden.hidden).toBe(true);
    const allRows = view.querySelectorAll('[data-settings-search-jumps] button');
    expect(allRows).toHaveLength(3);
    expect(new Set(allRows.map((row) => row.textContent)).size).toBe(3);
  });
});
