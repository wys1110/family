import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const split = readFileSync('feeding-pattern-split.js', 'utf8');
const helper = split.slice(0, split.indexOf('\n\n(() => {'));
const type = split.slice(split.indexOf('  function splitCareType'), split.indexOf('\n\n  const originalQuickPresets'));
const start = split.indexOf('  renderDailyCareClock = function renderSplitDailyCareClock');
const renderer = split.slice(start, split.indexOf('\n\n  function refreshCurrentTimeMarker', start));
const app = readFileSync('app.js', 'utf8');
const point = app.slice(app.indexOf('function clockPoint('), app.indexOf('\n\nfunction renderDailyCareClock'));
const script = existsSync('live-sleep-pattern.js') ? readFileSync('live-sleep-pattern.js', 'utf8') : '';

function harness() {
  let now = new Date(2026, 10, 6, 14, 30).getTime();
  const events = {}, ticks = [];
  const attributes = new Map(), content = { innerHTML: '' };
  let live = null;
  const node = () => ({
    attrs: new Map(), setAttribute(k, v) { this.attrs.set(k, String(v)); }, getAttribute(k) { return this.attrs.get(k) ?? null; },
    remove() { live = null; }, textContent: '',
  });
  const svg = {
    getAttribute: k => attributes.get(k) ?? null,
    setAttribute: (k, v) => attributes.set(k, String(v)), removeAttribute: k => attributes.delete(k),
    querySelector: selector => selector === '.care-band-track' ? { after: path => { live = path; } } : live,
  };
  const ctx = {
    state: { activeBabyId: 'baby', activeView: 'growth', babies: [{ id: 'baby' }], growthEntries: [] },
    careTimer: null, carePatternDate: '2026-11-06', carePatternView: 'day',
    carePatternCategories: new Set(['sleep']), careTimerContextKey: () => 'family-a',
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
    document: { hidden: false, addEventListener: (key, fn) => { events[key] = fn; }, createElementNS: node,
      querySelector: selector => selector.includes('.care-band-dial') ? svg : selector === '#carePatternContent' ? content : {},
    },
    window: { addEventListener: (key, fn) => { events[key] = fn; } }, setInterval: fn => ticks.push(fn),
    parseDate: key => new Date(`${key}T12:00:00`),
    dateKey: date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,
    formatDuration: value => `${value}분`, escapeHtml: String,
    activeBabyEntries: () => ctx.state.growthEntries, renderCareTimer() {},
    renderCarePattern: items => { live = null; ctx.renderDailyCareClock(items); },
  };
  vm.createContext(ctx); vm.runInContext(`${helper}\n${point}\n${type}\ngrowthCareType = splitCareType;\n${renderer}`, ctx);
  ctx.renderCarePattern([]);
  vm.runInContext(script, ctx);
  return { ctx, events, content, live: () => live, now: () => now,
    advance: seconds => { now += seconds * 1000; ticks.forEach(fn => fn()); },
    start: () => { ctx.careTimer = { type: 'sleep', babyId: 'baby', startedAt: now, contextKey: 'family-a' }; ctx.renderCareTimer(); },
  };
}

test('the web clock gains a live sleep range and advances without saving a record', () => {
  const h = harness(); h.start(); h.advance(60);
  expect(h.live()).not.toBeNull();
  expect(h.live().getAttribute('data-duration')).toBe('1');
  const path = h.live().getAttribute('d'); h.advance(60);
  expect(h.live().getAttribute('data-duration')).toBe('2');
  expect(h.live().getAttribute('d')).not.toBe(path);
  expect(h.ctx.state.growthEntries).toEqual([]);
});

test('ending freezes the range while saving; a confirmed stop removes it and a restart grows afresh', () => {
  const h = harness(); h.start(); h.advance(1800);
  h.ctx.careTimer.endedAt = h.now(); h.ctx.renderCareTimer();
  const frozen = h.live().getAttribute('d');
  h.advance(600);
  expect(h.live().getAttribute('d')).toBe(frozen);
  expect(h.live().getAttribute('data-duration')).toBe('30');
  expect(h.live().getAttribute('aria-label')).toContain('수면 종료');
  h.ctx.state.growthEntries.push({ id: 'saved', category: '수면', date: '2026-11-06', time: '14:30', sleepMinutes: 30 });
  h.ctx.careTimer = null; h.ctx.renderCarePattern(h.ctx.state.growthEntries);
  expect(h.live()).toBeNull();
  expect(h.content.innerHTML).toContain('class="care-band-range sleep" data-start="870" data-duration="30"');
  h.start(); h.advance(60);
  expect(h.live().getAttribute('data-duration')).toBe('1');
  expect(h.ctx.state.growthEntries).toHaveLength(1);
});

test('a sleep crossing midnight only fills the selected day and stops at midnight on the previous day', () => {
  const h = harness();
  h.ctx.careTimer = { type: 'sleep', babyId: 'baby', startedAt: new Date(2026, 10, 5, 23, 30).getTime(), contextKey: 'family-a' };
  h.ctx.renderCareTimer();
  expect(h.live().getAttribute('data-start')).toBe('0');
  expect(h.live().getAttribute('data-duration')).toBe('870');
  h.ctx.carePatternDate = '2026-11-05'; h.ctx.renderCarePattern([]);
  expect(h.live().getAttribute('data-start')).toBe('1410');
  expect(h.live().getAttribute('data-duration')).toBe('30');
  const previousDay = h.live().getAttribute('d'); h.advance(600);
  expect(h.live().getAttribute('d')).toBe(previousDay);
});

test.each(['baby', 'family', 'cancel', 'category', 'future', 'invalid-end'])('stale or hidden sleep ranges are removed (%s)', reason => {
  const h = harness(); h.start(); h.advance(60); expect(h.live()).not.toBeNull();
  if (reason === 'baby') h.ctx.state.activeBabyId = 'other';
  if (reason === 'family') h.ctx.careTimer.contextKey = 'family-b';
  if (reason === 'cancel') h.ctx.careTimer = null;
  if (reason === 'category') h.ctx.carePatternCategories.delete('sleep');
  if (reason === 'future') h.ctx.careTimer.startedAt = h.now() + 60000;
  if (reason === 'invalid-end') h.ctx.careTimer.endedAt = NaN;
  h.ctx.renderCareTimer(); expect(h.live()).toBeNull();
});

test('re-entry catches up from the original timestamp after the page was hidden', () => {
  const h = harness(); h.start(); h.advance(60);
  const before = h.live().getAttribute('d');
  h.ctx.document.hidden = true; h.advance(600);
  expect(h.live().getAttribute('d')).toBe(before);
  h.ctx.document.hidden = false; h.events.visibilitychange();
  expect(h.live().getAttribute('data-duration')).toBe('11');
});
