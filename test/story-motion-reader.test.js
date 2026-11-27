import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const reader = new URL('../assets/story-motion/milo/', import.meta.url);
const read = name => readFileSync(new URL(name, reader), 'utf8');

function openReader({ reducedMotion = true, artwork = false, query = '' } = {}) {
  const elements = new Map();
  const node = selector => {
    if (!elements.has(selector)) {
      elements.set(selector, Object.assign(new EventTarget(), {
        setAttribute() {}, toggleAttribute() {}, querySelector: node,
      }));
    }
    return elements.get(selector);
  };
  const context2d = { save() {}, setTransform() {}, restore() {} };
  node('#scene').getContext = () => artwork ? context2d : null;
  node('#scene').parentElement = { clientWidth: 360 };
  const frames = new Map();
  let frameId = 0;
  function tick(timestamp) {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(timestamp);
  }
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
  const mediaQuery = Object.assign(new EventTarget(), { matches: reducedMotion });
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => mediaQuery,
    miloArtworkReady: Promise.resolve(artwork),
    drawStoryFrame: vi.fn(),
  });
  const context = vm.createContext({
    document, window, Image: class { naturalWidth = 720; }, URL, URLSearchParams,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    location: new URL('https://example.test/family/assets/story-motion/milo/' + query),
  });
  vm.runInContext(read('timing.js'), context);
  vm.runInContext(read('player.js'), context);
  return { node, voice, window, document, mediaQuery, frames, tick, timing: window.storyTiming, click: id => node(id).dispatchEvent(new Event('click')) };
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


test('the illustration loops silently, can freeze independently and suspends when hidden', async () => {
  const r = openReader({ reducedMotion: false, artwork: true });
  await new Promise(resolve => setImmediate(resolve));
  const draw = r.window.drawStoryFrame;
  expect(r.frames.size).toBe(1);
  for (let ms = 0; ms <= 7500; ms += 100) r.tick(ms);
  const phases = draw.mock.calls.map(call => call[2]);
  expect(phases.some(phase => phase > .9)).toBe(true);
  expect(phases.some(phase => phase < .1)).toBe(true);
  expect(phases.every(phase => phase >= 0 && phase <= 1)).toBe(true);
  expect(draw.mock.calls.every(call => call[1] === 0)).toBe(true);
  expect(r.voice.play).not.toHaveBeenCalled();
  r.click('#motion-toggle');
  expect(r.frames.size).toBe(0);
  expect(r.node('#motion-toggle').textContent).toBe('그림 움직이기');
  r.click('#play');
  expect(r.voice.play).toHaveBeenCalledOnce();
  expect(r.frames.size).toBe(0);
  const count = draw.mock.calls.length;
  r.voice.currentTime = .7;
  r.voice.dispatchEvent(new Event('timeupdate'));
  expect(draw).toHaveBeenCalledTimes(count);
  r.voice.currentTime = r.timing.starts[1];
  r.voice.dispatchEvent(new Event('timeupdate'));
  expect(draw.mock.lastCall[1]).toBe(1);
  r.click('#motion-toggle');
  expect(r.frames.size).toBe(1);
  r.document.hidden = true;
  r.document.dispatchEvent(new Event('visibilitychange'));
  expect(r.frames.size).toBe(0);
  expect(r.voice.paused).toBe(true);
  r.document.hidden = false;
  r.document.dispatchEvent(new Event('visibilitychange'));
  expect(r.frames.size).toBe(1);
  expect(r.voice.play).toHaveBeenCalledOnce();
});

test('reduced motion opens with a still, and explicit playback can animate without sound', async () => {
  const r = openReader({ reducedMotion: true, artwork: true });
  await new Promise(resolve => setImmediate(resolve));
  expect(r.frames.size).toBe(0);
  expect(r.node('#motion-toggle').textContent).toBe('그림 움직이기');
  expect(r.window.drawStoryFrame.mock.lastCall[2]).toBe(.65);
  r.click('#motion-toggle');
  r.tick(0);
  r.tick(100);
  expect(r.window.drawStoryFrame.mock.lastCall[2]).toBeGreaterThan(.65);
  r.click('#next');
  expect(r.window.drawStoryFrame.mock.lastCall[1]).toBe(1);
  r.window.dispatchEvent(new Event('pagehide'));
  expect(r.frames.size).toBe(0);
  r.window.dispatchEvent(new Event('pageshow'));
  expect(r.frames.size).toBe(1);
  r.mediaQuery.dispatchEvent(new Event('change'));
  expect(r.frames.size).toBe(0);
  expect(r.voice.play).not.toHaveBeenCalled();
});

test('a link to the current page opens quietly and starts narration there on request', () => {
  const r = openReader({ query: '?demo=1&page=4' });
  expect(r.node('#page-num').textContent).toBe('4');
  expect(r.node('#line-ko').textContent).toContain('바구니');
  expect(r.voice.play).not.toHaveBeenCalled();
  r.click('#play');
  expect(r.voice.currentTime).toBe(r.timing.starts[3]);
  for (const value of ['0', '8', '2.5', '02', '-1', 'oops']) {
    expect(openReader({ query: '?page=' + value }).node('#page-num').textContent).toBe('1');
  }
});
