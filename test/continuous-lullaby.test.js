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

function setup(storage = new Map()) {
  vi.useFakeTimers();
  const audio = Object.assign(new EventTarget(), {
    style: {}, paused: true, error: null, ended: false, currentTime: 0,
    readyState: 0, HAVE_FUTURE_DATA: 3,
    play: vi.fn(async () => signalPlaying()),
    pause: () => { audio.paused = true; audio.dispatchEvent(new Event('pause')); },
    load: () => {
      audio.readyState = 0;
      audio.paused = true;
      audio.error = null;
      audio.ended = false;
    },
    setAttribute() {},
    removeAttribute(name) { if (name === 'src') delete this.source; },
  });
  Object.defineProperty(audio, 'src', {
    set(value) { this.source = value; this.load(); },
    get() { return this.source; },
  });
  function signalPlaying() {
    audio.paused = false;
    audio.ended = false;
    audio.readyState = audio.HAVE_FUTURE_DATA;
    audio.dispatchEvent(new Event('playing'));
  }
  function deferPlay() {
    let complete, fail;
    const pending = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
    audio.play.mockImplementationOnce(() => {
      audio.paused = false;
      audio.dispatchEvent(new Event('waiting'));
      return pending;
    });
    return {complete, fail};
  }
  const session = Object.assign(new EventTarget(), {type: 'auto', state: 'active'});
  const navigator = {onLine: true, audioSession: session};
  const window = Object.assign(new EventTarget(), {
    location: {href: 'https://test.invalid/', replace: vi.fn()},
    setTimeout, setInterval, FAMILY_MODULE_SIGNATURE: 'old@1',
    FAMILY_DEMO: {storageKey: key => key}, toast: vi.fn(),
  });
  const panel = {hidden: true};
  const status = {textContent: ''};
  const toggle = {textContent: '', setAttribute() {}};
  const picker = {options: [], add(option) { this.options.push(option); }};
  const slot = {append(element) { element.parentNode = this; }};
  const elements = {lullabyPanel: panel, lullabyStatus: status, lullabyToggle: toggle,
    lullabyTrack: picker, lullabyPlayerSlot: slot};
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    querySelector: id => elements[id.slice(1)] || null,
  });
  function setVisibility(state) {
    document.visibilityState = state;
    document.dispatchEvent(new Event('visibilitychange'));
  }
  const localStorage = {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)};
  const context = vm.createContext({window, document, navigator, Event, CustomEvent, URL,
    setTimeout, clearTimeout, Audio: function () { return audio; },
    Option: function (label, value) { Object.assign(this, {label, value}); }, localStorage,
    sessionStorage: new Map(), fetch: async () => ({ok:true, text:async () => '{name:"new", version:"2"}'})});
  let playback;
  window.addEventListener('family:lullaby-playback', event => { playback = event.detail; });
  vm.runInContext(playerSource, context);
  const player = window.FAMILY_LULLABY;
  return {player, audio, session, window, context, panel, status, toggle, picker,
    signalPlaying, deferPlay, setVisibility, get playback() { return playback; }};
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

test('starts with rustle and restores the last chosen track without autoplay', async () => {
  const storage = new Map();
  const firstVisit = setup(storage);
  expect(firstVisit.picker.options.map(option => [option.value, option.label])).toEqual([
    ['rustle', '바스락선생'], ['rain', '잔잔한 빗소리'], ['waves', '파도 소리'],
  ]);
  expect(firstVisit.picker.value).toBe('rustle');
  expect(firstVisit.audio.play).not.toHaveBeenCalled();
  await firstVisit.player.select('rain', {playNow: true});
  expect(firstVisit.playback).toMatchObject({id: 'rain', playing: true});
  const nextVisit = setup(storage);
  expect(nextVisit.picker.value).toBe('rain');
  expect(nextVisit.audio.play).not.toHaveBeenCalled();
});

test('only the latest selection plays when an earlier request fails after switching', async () => {
  const view = setup();
  const earlier = view.deferPlay();
  const startRain = view.player.select('rain', {playNow: true});
  const latest = view.deferPlay();
  const startWaves = view.player.select('waves', {playNow: true});
  earlier.fail(new DOMException('Source changed', 'AbortError'));
  await startRain;
  view.player.attach();
  expect(view.audio.src).toBe('assets/lullaby-waves.m4a');
  expect(view.playback).toMatchObject({id: 'waves', requested: true, playing: false});
  view.signalPlaying();
  latest.complete();
  await startWaves;
  expect(view.playback).toMatchObject({id: 'waves', requested: true, playing: true});
  expect(view.window.toast).not.toHaveBeenCalled();
});

test.each(['stop', 'pagehide'])('cancels an unfinished play on %s', async action => {
  const view = setup();
  const pending = view.deferPlay();
  const start = view.player.toggle();
  if (action === 'stop') view.player.toggle();
  else view.window.dispatchEvent(new Event('pagehide'));
  expect(view.audio.src).toBeUndefined();
  expect(view.panel.hidden).toBe(true);
  pending.fail(new DOMException('Request canceled', 'AbortError'));
  await start;
  view.window.dispatchEvent(new Event('pageshow'));
  expect(view.audio.src).toBeUndefined();
  expect(view.panel.hidden).toBe(true);
  expect(view.toggle.textContent).toBe('자장가 재생');
  expect(view.playback).toMatchObject({requested: false, playing: false});
  expect(view.window.toast).not.toHaveBeenCalled();
});

test('resets the controls after the first play fails and permits a second attempt', async () => {
  const view = setup();
  view.audio.play.mockRejectedValueOnce(new DOMException('Playback blocked', 'NotAllowedError'));
  await view.player.select('waves', {playNow: true});
  expect(view.playback).toMatchObject({id: 'waves', requested: false, playing: false});
  expect(view.toggle.textContent).toBe('자장가 재생');
  expect(view.window.toast).toHaveBeenCalledOnce();
  await view.player.toggle();
  expect(view.playback).toMatchObject({id: 'waves', requested: true, playing: true});
});

test('discards a hidden WebKit playback rejection when the document is left and restored', async () => {
  const view = setup();
  const pending = view.deferPlay();
  const start = view.player.toggle();
  view.setVisibility('hidden');
  pending.fail(new DOMException('Media request ended on navigation', 'NotSupportedError'));
  await start;
  expect(view.window.toast).not.toHaveBeenCalled();
  view.window.dispatchEvent(new Event('pagehide'));
  view.window.dispatchEvent(new Event('pageshow'));
  view.setVisibility('visible');
  expect(view.window.toast).not.toHaveBeenCalled();
  expect(view.playback).toMatchObject({requested: false, playing: false});
});

test('reports a hidden source failure once when returning to the same open tab', async () => {
  const view = setup();
  const pending = view.deferPlay();
  const start = view.player.toggle();
  view.setVisibility('hidden');
  expect(view.playback.requested).toBe(true);
  pending.fail(new DOMException('Source cannot play', 'NotSupportedError'));
  await start;
  expect(view.window.toast).not.toHaveBeenCalled();
  view.setVisibility('visible');
  view.setVisibility('hidden');
  view.setVisibility('visible');
  expect(view.window.toast).toHaveBeenCalledOnce();
  expect(view.playback).toMatchObject({requested: false, playing: false});
});

test('reports a source failure immediately while the player is visible', async () => {
  const view = setup();
  view.audio.play.mockRejectedValueOnce(new DOMException('Source cannot play', 'NotSupportedError'));
  await view.player.toggle();
  expect(view.window.toast).toHaveBeenCalledOnce();
});

test.each(['stop', 'track change'])('drops a deferred source error after an explicit %s', async action => {
  const view = setup();
  const pending = view.deferPlay();
  const start = view.player.toggle();
  view.setVisibility('hidden');
  pending.fail(new DOMException('Source cannot play', 'NotSupportedError'));
  await start;
  if (action === 'stop') view.player.stop();
  else view.player.select('waves');
  view.setVisibility('visible');
  expect(view.window.toast).not.toHaveBeenCalled();
});

test('briefly hiding the same document neither cancels nor restarts active audio', async () => {
  const view = setup();
  await view.player.toggle();
  view.setVisibility('hidden');
  view.setVisibility('visible');
  expect(view.audio.play).toHaveBeenCalledOnce();
  expect(view.playback).toMatchObject({requested: true, playing: true});
  expect(view.window.toast).not.toHaveBeenCalled();
});

test('shows waiting while media buffers and active playback once ready', async () => {
  const view = setup();
  const pending = view.deferPlay();
  const start = view.player.toggle();
  view.player.attach();
  expect(view.playback).toMatchObject({requested: true, playing: false});
  expect(view.status.textContent).toBe('재생 대기 중');
  expect(view.toggle.textContent).toBe('자장가 정지');
  view.signalPlaying();
  pending.complete();
  await start;
  expect(view.status.textContent).toBe('연속 반복');
  view.audio.readyState = 2;
  view.audio.dispatchEvent(new Event('waiting'));
  expect(view.playback).toMatchObject({requested: true, playing: false});
  expect(view.status.textContent).toBe('재생 대기 중');
  view.signalPlaying();
  expect(view.playback).toMatchObject({requested: true, playing: true});
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
