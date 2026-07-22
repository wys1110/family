import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../growth-dedup.js', import.meta.url), 'utf8');

class FakeNode {
  constructor(tagName = '') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.className = '';
    this.removed = false;
    this._textContent = '';
  }

  appendChild(child) {
    this._textContent = '';
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    this._textContent = '';
    children.forEach((child) => this.appendChild(child));
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  set textContent(value) {
    this.children = [];
    this._textContent = String(value);
  }

  get textContent() {
    return this.children.length
      ? this.children.map((child) => child.textContent).join('')
      : this._textContent;
  }

  remove() {
    this.removed = true;
  }
}

function createGrowthDocument() {
  const title = new FakeNode('h2');
  title.textContent = '진행 중 기록';

  const quickGrid = new FakeNode('div');
  quickGrid.querySelectorAll = () => [];

  const quickBlock = new FakeNode('div');
  quickBlock.querySelector = (selector) => selector === '.growth-quick-grid' ? quickGrid : null;

  const timerCard = new FakeNode('section');
  timerCard.querySelector = (selector) => {
    if (selector === '.care-quick-block') return quickBlock;
    return null;
  };

  const quickSection = new FakeNode('section');
  const document = {
    createElement: (tagName) => new FakeNode(tagName),
    createTextNode: (text) => {
      const node = new FakeNode();
      node.textContent = text;
      return node;
    },
    querySelector: (selector) => {
      if (selector === '#careTimerCard') return timerCard;
      if (selector === '#growthQuickSection') return quickSection.removed ? null : quickSection;
      if (selector === '#careTimerTitle') return title;
      return null;
    },
  };

  return { document, quickSection, title };
}

describe('growth recording deduplication', () => {
  it('rebuilds the surviving recording title with one decorative timer icon', () => {
    const { document, quickSection, title } = createGrowthDocument();
    const context = {
      document,
      localStorage: { getItem: () => 'week', setItem: () => {} },
    };

    vm.runInNewContext(source, context);
    vm.runInNewContext(source, context);

    const icons = title.children.filter((child) => child.className === 'storybook-heading-icon');
    expect(quickSection.removed).toBe(true);
    expect(title.textContent).toBe('⏱️기록하기');
    expect(icons).toHaveLength(1);
    expect(icons[0].textContent).toBe('⏱️');
    expect(icons[0].getAttribute('aria-hidden')).toBe('true');
  });
});
