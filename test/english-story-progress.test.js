import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const source = readFileSync('english-stories.js', 'utf8');
const storyId = 'doyun-tiny-star';
const settingsKey = user => `family-english-story-settings-v1:${user}`;

function setup({ user = 'a', store = new Map(), demo = false } = {}) {
  const nodes = new Map(), events = {}, spoken = [], notices = [];
  const makeNode = () => {
    const children = new Map(), listeners = {}, classes = new Set();
    return {
      dataset: {}, style: {}, attributes: {}, hidden: false, textContent: '',
      classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains: name => classes.has(name) },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      querySelector(selector) { if (!children.has(selector)) children.set(selector, makeNode()); return children.get(selector); },
      addEventListener(name, handler) { listeners[name] = handler; },
      click(target = this) { listeners.click?.({ target }); },
      scrollIntoView() {}, insertBefore() {},
      appendChild(node) { nodes.set(`#${node.id}`, node); },
      set innerHTML(html) {
        this.html = html;
        for (const match of html.matchAll(/id="([^"]+)"/g)) nodes.set(`#${match[1]}`, makeNode());
      },
    };
  };
  nodes.set('.view-tabs', makeNode()); nodes.set('main', makeNode());
  const tab = makeNode(); tab.dataset.view = 'english'; nodes.set('[data-view="english"]', tab);
  const state = { session: user ? { user: { id: user } } : null, authReady: true, activeView: 'calendar' };
  const speech = { speak: utterance => spoken.push(utterance), cancel() {}, pause() {}, resume() {}, getVoices: () => [] };
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const window = { speechSynthesis: speech, addEventListener: (name, callback) => { events[name] = callback; }, location: { href: `https://example.test/${demo ? '?demo=1' : ''}` } };
  const context = { window, state, localStorage: storage, sessionStorage: { getItem: () => null, setItem() {} }, URL,
    document: { querySelector: selector => nodes.get(selector) ?? null, querySelectorAll: () => [], createElement: makeNode },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    toast: notice => notices.push(notice), setTimeout() {}, switchView: view => { state.activeView = view; },
  };
  vm.createContext(context);
  vm.runInContext(readFileSync('demo-mode.js', 'utf8'), context);
  vm.runInContext(source, context);
  const node = id => nodes.get(`#${id}`);
  const choose = id => node('englishLibrary').click({ closest: () => ({ dataset: { storyId: id } }) });
  return { node, choose, context, state, events, spoken, notices, store, play: () => node('englishPlayButton').click(),
    leave: () => context.switchView('calendar'), end: () => spoken.at(-1).onend(),
    line: index => node('englishSentenceList').click({ closest: () => ({ dataset: { playLine: String(index) } }) }),
  };
}

function interrupted(h) { h.choose(storyId); h.play(); h.end(); h.end(); h.leave(); }

test('interrupt and reload keep the current sentence until explicit continuation or restart', () => {
  const h = setup(); interrupted(h);
  const sentence = h.spoken.at(-1).text;
  const reloaded = setup({ store: h.store });
  expect(reloaded.spoken).toHaveLength(0);
  expect(reloaded.node('englishPlayButton').querySelector('strong').textContent).toBe('이어 듣기');
  reloaded.play(); expect(reloaded.spoken.at(-1).text).toBe(sentence);
  expect(reloaded.node('englishRestartButton')).toBeDefined();
  reloaded.node('englishRestartButton').click();
  expect(reloaded.spoken.at(-1).text).toBe('Doyun looked up at the quiet night sky.');
  const progress = reloaded.node('englishProgress');
  expect(progress.attributes['aria-valuemax']).toBe('7');
  expect(reloaded.node('englishProgressStatus').textContent).toContain('1 / 7');
});

test('speed restarts the active sentence and cancelled callbacks cannot advance or stop it', () => {
  const h = setup(); h.choose(storyId); h.play(); h.end(); h.end();
  const cancelled = h.spoken.at(-1), sentence = cancelled.text;
  h.node('englishSpeedButton').click();
  const current = h.spoken.at(-1);
  expect(current.text).toBe(sentence); expect(current.rate).toBe(0.95);
  cancelled.onend(); cancelled.onerror({ error: 'canceled' });
  expect(h.spoken.at(-1)).toBe(current);
  expect(h.node('englishPlayButton').querySelector('strong').textContent).toBe('잠시 멈춤');
  h.end(); expect(h.spoken.at(-1).text).toBe('No, said the star. Love is always near me.');
});

test('completed stories show full progress, restart explicitly, and do not mark another story complete', () => {
  const h = setup(); h.choose(storyId); h.play();
  for (let index = 0; index < 7; index++) h.end();
  expect(h.node('englishProgressBar').style.width).toBe('100%');
  expect(h.node('englishPlayButton').querySelector('strong').textContent).toBe('다시 듣기');
  expect(h.node('englishMarkRead').textContent).toContain('완료');
  h.choose('moon-soft-blanket');
  expect(h.node('englishMarkRead').textContent).not.toContain('완료');
  h.choose(storyId); expect(h.node('englishMarkRead').textContent).toContain('완료');
  h.play(); expect(h.spoken.at(-1).text).toBe('Doyun looked up at the quiet night sky.');
});

test('account changes and demo/device stores isolate progress and history without stale callback writes', () => {
  const h = setup(); interrupted(h);
  const savedA = h.store.get(settingsKey('a')), cancelled = h.spoken.at(-1);
  h.state.session = { user: { id: 'b' } }; h.events.familycontextchange();
  cancelled.onend(); cancelled.onerror({ error: 'canceled' });
  expect(h.store.get(settingsKey('a'))).toBe(savedA); expect(h.store.has(settingsKey('b'))).toBe(false);
  expect(h.node('englishPlayButton').querySelector('strong').textContent).toBe('전체 듣기');
  h.choose(storyId); h.play(); expect(h.spoken.at(-1).text).toBe('Doyun looked up at the quiet night sky.');
  h.state.session = { user: { id: 'a' } }; h.events.familycontextchange(); h.play();
  expect(h.spoken.at(-1).text).toBe('Are you alone up there? Doyun asked.');
  const demo = setup({ store: h.store, user: 'a', demo: true }); interrupted(demo); demo.node('englishMarkRead').click();
  expect(h.store.get(settingsKey('a'))).toBe(savedA);
  expect([...h.store.keys()].some(key => key.startsWith('family-demo-english-story-history-v1:'))).toBe(true);
  const device = setup({ store: h.store, user: null }); interrupted(device);
  expect(h.store.has(settingsKey('device'))).toBe(true);
});

test('single-sentence listening retains its mode on speed change and pause does not autoplay on speed change', () => {
  const h = setup(); h.choose(storyId); h.line(3); h.node('englishSpeedButton').click();
  expect(h.spoken.at(-1).text).toBe('No, said the star. Love is always near me.');
  const count = h.spoken.length; h.end(); expect(h.spoken).toHaveLength(count);
  h.play(); h.play(); h.node('englishSpeedButton').click();
  expect(h.spoken).toHaveLength(count + 1);
  expect(h.node('englishPlayButton').querySelector('strong').textContent).toBe('이어 듣기');
  h.play(); expect(h.spoken.at(-1).text).toBe('Your family’s love is near you, too.');
});

test('interrupting the first sentence still offers continuation and tab entry never starts speech', () => {
  const h = setup(); h.choose(storyId); h.play(); h.leave();
  const reloaded = setup({ store: h.store }); reloaded.context.switchView('english');
  expect(reloaded.spoken).toHaveLength(0);
  expect(reloaded.node('englishPlayButton').querySelector('strong').textContent).toBe('이어 듣기');
  reloaded.play(); expect(reloaded.spoken.at(-1).text).toBe('Doyun looked up at the quiet night sky.');
});

test('manual completion stops speech and late callbacks cannot undo completed progress', () => {
  const h = setup(); h.choose(storyId); h.play(); h.end();
  const cancelled = h.spoken.at(-1); h.node('englishMarkRead').click();
  cancelled.onend(); cancelled.onerror({ error: 'canceled' });
  expect(h.node('englishPlayButton').querySelector('strong').textContent).toBe('다시 듣기');
  expect(h.node('englishProgressBar').style.width).toBe('100%');
  expect(h.spoken).toHaveLength(2);
});

test('a speech error preserves the interrupted sentence and reports a retry action', () => {
  const h = setup(); h.choose(storyId); h.play(); h.end();
  const failed = h.spoken.at(-1); failed.onerror({ error: 'network' });
  expect(h.node('englishPlayButton').querySelector('strong').textContent).toBe('이어 듣기');
  expect(h.notices.at(-1)).toContain('다시 시도');
  h.play(); expect(h.spoken.at(-1).text).toBe(failed.text);
});

test('speech cannot write the newly selected account before its context event arrives', () => {
  const h = setup(); h.choose(storyId); h.play(); h.end();
  h.state.session = { user: { id: 'b' } };
  h.end();
  expect(h.store.has(settingsKey('b'))).toBe(false);
  expect(JSON.parse(h.store.get(settingsKey('a'))).progress[storyId]).toBe(2);
  h.events.familycontextchange();
  expect(h.node('englishPlayButton').querySelector('strong').textContent).toBe('전체 듣기');
});

test('a finished sentence callback cannot stop or duplicate the following sentence', () => {
  const h = setup(); h.choose(storyId); h.play();
  const finished = h.spoken.at(-1); h.end(); const current = h.spoken.at(-1);
  finished.onend(); finished.onerror({ error: 'interrupted' });
  expect(h.spoken).toHaveLength(2);
  expect(h.spoken.at(-1)).toBe(current);
  expect(h.node('englishPlayButton').querySelector('strong').textContent).toBe('잠시 멈춤');
});
