import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, expect, test, vi } from 'vitest';

const playerSource = readFileSync('lullaby.js', 'utf8');
const updateSource = readFileSync('app-update.js', 'utf8');
afterEach(() => vi.useRealTimers());

test('the rustle recording has a single audio timeline for WebKit looping', () => {
  const recording = readFileSync('assets/buseureok.m4a');
  const atoms = [];
  for (let offset = 0; offset < recording.length;) {
    const size = recording.readUInt32BE(offset);
    expect(size).toBeGreaterThanOrEqual(8);
    expect(offset + size).toBeLessThanOrEqual(recording.length);
    atoms.push(recording.toString('ascii', offset + 4, offset + 8));
    offset += size;
  }
  expect(atoms).toContain('moov');
  expect(atoms.filter(type => type === 'mdat')).toHaveLength(1);
  expect(atoms).not.toContain('moof');
});

function setup() {
  vi.useFakeTimers();
  const audio = Object.assign(new EventTarget(), {
    style: {}, paused: true, error: null, ended: false, currentTime: 0,
    play: vi.fn(async () => { audio.paused = false; audio.dispatchEvent(new Event('playing')); }),
    pause: () => { audio.paused = true; audio.dispatchEvent(new Event('pause')); },
    load: () => { audio.error = null; }, setAttribute() {}, removeAttribute() {},
  });
  const session = Object.assign(new EventTarget(), {type: 'auto', state: 'active'});
  const navigator = {onLine: true, audioSession: session};
  const window = Object.assign(new EventTarget(), {
    location: {href: 'https://test.invalid/', replace: vi.fn()},
    setTimeout, setInterval, FAMILY_MODULE_SIGNATURE: 'old@1',
  });
  const document = Object.assign(new EventTarget(), {querySelector: () => null});
  const context = vm.createContext({window, document, navigator, Event, CustomEvent, URL,
    setTimeout, clearTimeout, Audio: function () { return audio; },
    sessionStorage: new Map(), fetch: async () => ({ok:true, text:async () => '{name:"new", version:"2"}'})});
  vm.runInContext(playerSource, context);
  const player = window.FAMILY_LULLABY;
  return {player, audio, session, window, context};
}

test('a stopped audio engine at a loop boundary rewinds only the requested track', async () => {
  const {player, audio} = setup();
  await player.toggle();
  audio.currentTime = 217; audio.ended = true; audio.pause();
  audio.dispatchEvent(new Event('ended'));
  expect(audio.play).toHaveBeenCalledTimes(2);
  expect(audio.currentTime).toBe(0);
  player.stop();
  audio.dispatchEvent(new Event('ended'));
  expect(audio.play).toHaveBeenCalledTimes(2);
});

test('audio interruptions resume while an explicit pause or stop cancels recovery', async () => {
  const {player, audio, session} = setup();
  const change = state => { session.state = state; session.dispatchEvent(new Event('statechange')); };
  await player.toggle();
  expect(session.type).toBe('playback');
  change('interrupted'); audio.pause(); change('active');
  expect(audio.play).toHaveBeenCalledTimes(2);
  audio.pause(); change('interrupted'); change('active');
  expect(audio.play).toHaveBeenCalledTimes(2);
  await player.toggle();
  change('interrupted'); audio.pause(); player.stop(); change('active');
  expect(audio.play).toHaveBeenCalledTimes(3);
  expect(session.type).toBe('auto');
});

test('recover a transient stream failure and discard a pending retry after stop or track switch', async () => {
  const {audio, player} = setup();
  function fail() { audio.error = {code: 2}; audio.dispatchEvent(new Event('error')); }
  await player.toggle();
  fail(); await vi.advanceTimersByTimeAsync(1000);
  expect(audio.play).toHaveBeenCalledTimes(2);
  fail(); await player.select('waves', {playNow:true});
  await vi.advanceTimersByTimeAsync(31000);
  expect(audio.src).toBe('assets/lullaby-waves.m4a');
  expect(audio.play).toHaveBeenCalledTimes(3);
  fail(); player.stop(); await vi.advanceTimersByTimeAsync(31000);
  expect(audio.play).toHaveBeenCalledTimes(3);
});

test('an app update queued just before play waits until the lullaby stops', async () => {
  const {player, window, context} = setup();
  vm.runInContext(updateSource, context);
  window.dispatchEvent(new Event('pageshow'));
  await vi.advanceTimersByTimeAsync(5);
  await player.toggle();
  await vi.advanceTimersByTimeAsync(1500);
  expect(window.location.replace).not.toHaveBeenCalled();
  player.stop(); await vi.advanceTimersByTimeAsync(350);
  expect(window.location.replace).toHaveBeenCalledTimes(1);
});
