import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const reader = new URL('../assets/story-motion/milo/', import.meta.url);
const read = name => readFileSync(new URL(name, reader), 'utf8');

function openReader() {
  const elements = new Map();
  const node = selector => {
    if (!elements.has(selector)) {
      elements.set(selector, Object.assign(new EventTarget(), {
        setAttribute() {}, toggleAttribute() {}, querySelector: node,
      }));
    }
    return elements.get(selector);
  };
  node('#scene').getContext = () => null;
  const voice = Object.assign(node('#voice'), {
    currentTime: 0, readyState: 1, paused: true,
    play: vi.fn(async () => {
      voice.paused = false;
      voice.dispatchEvent(new Event('playing'));
    }),
    pause() {
      voice.paused = true;
      voice.dispatchEvent(new Event('pause'));
    },
  });
  const document = Object.assign(new EventTarget(), { querySelector: node, querySelectorAll: () => [] });
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => Object.assign(new EventTarget(), { matches: true }),
  });
  const context = vm.createContext({
    document, window, Image: class {}, URL, URLSearchParams,
    location: new URL('https://example.test/family/assets/story-motion/milo/'),
  });
  vm.runInContext(read('timing.js'), context);
  vm.runInContext(read('player.js'), context);
  return { node, voice, timing: window.storyTiming, click: id => node(id).dispatchEvent(new Event('click')) };
}

test('a parent can read all seven captions and turn back without starting narration', () => {
  const openingTag = read('index.html').match(/<audio\b[^>]*>/i)?.[0];
  expect(openingTag).toBeDefined();
  expect(openingTag).not.toMatch(/\b(?:autoplay|loop)\b/i);

  const { node, click, voice, timing } = openReader();
  const edges = [...timing.starts, timing.duration];
  expect(timing.starts).toHaveLength(7);
  expect(timing.starts[0]).toBe(0);
  expect(edges.every(Number.isFinite)).toBe(true);
  expect(edges.slice(1).every((time, index) => time > edges[index])).toBe(true);

  const captions = new Set();
  for (const [page, start] of timing.starts.entries()) {
    if (page) click('#next');
    expect(voice.currentTime).toBe(start);
    expect(node('#page-num').textContent).toBe(String(page + 1));
    expect(node('#line-ko').textContent).toMatch(/[가-힣]/);
    expect(node('#line-en').textContent).toMatch(/[a-z]/i);
    captions.add(node('#line-ko').textContent);
  }
  expect(captions.size).toBe(timing.starts.length);
  expect(node('#next').disabled).toBe(true);
  click('#prev');
  expect(voice.currentTime).toBe(timing.starts.at(-2));
  expect(voice.play).not.toHaveBeenCalled();
});

test('narration starts at the chosen page, advances with the audio clock and replays only on request', () => {
  const { node, click, timing, voice } = openReader();
  click('#next');
  click('#play');
  expect(voice.currentTime).toBe(timing.starts[1]);
  expect(voice.play).toHaveBeenCalledTimes(1);

  voice.currentTime = timing.starts[2];
  voice.dispatchEvent(new Event('timeupdate'));
  expect(node('#page-num').textContent).toBe('3');

  voice.currentTime = timing.duration;
  voice.paused = true;
  voice.dispatchEvent(new Event('ended'));
  expect(node('#page-num').textContent).toBe(String(timing.starts.length));
  expect(voice.play).toHaveBeenCalledTimes(1);
  click('#play');
  expect(voice.currentTime).toBe(0);
  expect(node('#page-num').textContent).toBe('1');
  expect(voice.play).toHaveBeenCalledTimes(2);
});
