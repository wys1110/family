import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';
const source = readFileSync('app.js', 'utf8');
function harness() {
  const nodes = new Map(), handlers = new Map();
  const element = () => ({ innerHTML: '', value: '', dataset: {}, attributes: {}, children: [], classList: { toggle: vi.fn() }, setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(name, fn) { this[name] = fn; }, appendChild(child) { this.children.push(child); }, querySelectorAll() { return []; } });
  const $ = selector => { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); };
  const buttons = ['all', 'today', 'photo'].map(mode => Object.assign(element(), { dataset: { growthFilter: mode } }));
  $('#growthFilterBar').querySelectorAll = () => buttons;
  $('#growthList').querySelectorAll = () => {
    const rows = [...$('#growthList').innerHTML.matchAll(/data-id="([^"]+)"/g)].map(match => Object.assign(element(), { dataset: { id: match[1] } }));
    $('#growthList').rows = rows;
    return rows;
  };
  const state = { activeView: 'growth', activeBabyId: 'baby', growthFilter: 'all', growthCategory: '', growthFrom: '', growthTo: '', growthEntries: Array.from({ length: 250 }, (_, i) => ({ id: String(i), babyId: 'baby', date: '2026-10-13', time: `${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`, category: i % 2 ? '수면' : '성장', title: `entry${i}` })) };
  const context = { state, $, document: { createElement: element }, window: { scrollY: 42, scrollTo: vi.fn(), addEventListener: (name, fn) => handlers.set(name, fn) }, activeBaby: () => ({ name: '아기' }), activeBabyEntries: () => state.growthEntries.filter(entry => entry.babyId === state.activeBabyId), growthListContext: '', growthListLimit: 100, escapeHtml: String, parseDate: key => new Date(`${key}T12:00:00`), dateKey: () => '2026-10-13', growthEntryMeta: () => '', openGrowthDialog: vi.fn(), renderGrowth: vi.fn(), renderCalendar: vi.fn(), renderAgenda: vi.fn(), renderUpcomingEvents: vi.fn() };
  vm.createContext(context);
  for (const [name, end] of [['renderGrowthList', 'activeBaby'], ['filterGrowthEntries', 'selectBabyFromEvent']]) {
    const start = source.indexOf(`function ${name}(`);
    expect(start, `${name} must exist`).toBeGreaterThan(-1);
    vm.runInContext(source.slice(start, source.indexOf(`function ${end}(`, start)), context);
  }
  const start = source.indexOf('  $("#growthRecordFilters").addEventListener("change"');
  vm.runInContext(source.slice(start, source.indexOf('  $("#growthSummaryPeriod")', start)), context);
  return { context, $, buttons, handlers };
}
const rowCount = node => (node.innerHTML.match(/class="growth-entry /g) || []).length;
test('more renders two hundred rows from current records with scroll retained and no full render', () => {
  const { context, $ } = harness();
  context.renderGrowthList();
  expect(rowCount($('#growthList'))).toBe(100);
  expect($('#growthCount').textContent).toBe('250개 기록');
  expect($('#growthList').innerHTML.indexOf('data-id="249"')).toBeLessThan($('#growthList').innerHTML.indexOf('data-id="248"'));
  const more = $('#growthList').children.at(-1);
  context.state.growthEntries.push({ id: 'new', babyId: 'baby', date: '2026-10-14', category: '성장', title: 'new' });
  more.click();
  expect(rowCount($('#growthList'))).toBe(200);
  expect($('#growthCount').textContent).toBe('251개 기록');
  expect($('#growthList').innerHTML).toContain('data-id="new"');
  expect(context.window.scrollTo).toHaveBeenCalledWith({ top: 42, behavior: 'instant' });
  expect(context.renderGrowth).not.toHaveBeenCalled();
});
test('filter handlers only render the list, preserve period semantics and reset pagination and ARIA', () => {
  const { context, $, buttons } = harness();
  context.renderGrowthList(); $('#growthList').children.at(-1).click();
  context.changeGrowthFilter({ target: { closest: () => buttons[1] } });
  expect(context.growthListLimit).toBe(100);
  expect(buttons[1].attributes['aria-pressed']).toBe('true');
  $('#growthCategoryFilter').value = '수면'; $('#growthFrom').value = '2026-10-13'; $('#growthTo').value = '2026-10-13';
  $('#growthRecordFilters').change({ target: { type: 'date' } });
  expect(context.state.growthFilter).toBe('all');
  expect($('#growthCount').textContent).toBe('125개 기록');
  $('#growthFrom').value = '2026-10-14';
  $('#growthRecordFilters').change({ target: { type: 'date' } });
  expect($('#growthFrom').attributes['aria-invalid']).toBe('true');
  expect($('#growthCount').textContent).toBe('0개 기록');
  expect($('#growthList').innerHTML).toContain('아직 표시할 기록이 없어요');
  $('#growthResetFilters').click();
  expect([context.state.growthFilter, context.state.growthCategory, context.state.growthFrom, context.state.growthTo]).toEqual(['all', '', '', '']);
  expect($('#growthCount').textContent).toBe('250개 기록');
  expect(context.renderGrowth).not.toHaveBeenCalled();
});
test('context changes retain full rendering for refreshed cards', () => {
  const { context, handlers } = harness();
  handlers.get('familycontextchange')();
  expect(context.renderGrowth).toHaveBeenCalledTimes(1);
});

test('context changes reset hidden filters without calculating growth cards', () => {
  const { context, handlers } = harness();
  context.state.activeView = 'calendar';
  context.state.growthCategory = '수면';
  context.state.growthFrom = '2026-10-01';
  handlers.get('familycontextchange')();
  expect([context.state.growthCategory, context.state.growthFrom, context.state.growthTo]).toEqual(['', '', '']);
  expect(context.renderCalendar).toHaveBeenCalledOnce();
  expect(context.renderGrowth).not.toHaveBeenCalled();
});

test('partial list render binds the same per-image photo recovery as a full render', () => {
  const image = { dataset: {}, addEventListener: vi.fn() };
  const jobs = [];
  const full = vi.fn(), list = vi.fn();
  const context = {
    state: { growthEntries: [], household: { id: 'house' }, session: { user: { id: 'user' } }, supabase: null },
    GROWTH_PHOTO_BUCKET: 'photos', hydrateGrowthPhotoUrls() {}, renderGrowth: full, renderGrowthList: list,
    queueMicrotask: job => jobs.push(job),
    document: { addEventListener() {}, querySelectorAll: () => [image] },
    window: { addEventListener() {}, setInterval() {}, setTimeout() {} },
  };
  vm.createContext(context);
  vm.runInContext(readFileSync('growth-photo-recovery.js', 'utf8'), context);
  context.renderGrowthList();
  expect(list).toHaveBeenCalledTimes(1);
  expect(full).not.toHaveBeenCalled();
  expect(jobs).toHaveLength(1);
  jobs.shift()();
  expect(image.dataset.photoRecoveryBound).toBe('true');
  expect(image.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
  context.renderGrowth(); jobs.shift()();
  expect(image.addEventListener).toHaveBeenCalledTimes(1);
});


test('list edits resolve the raw current record ID instead of a stale rendered object', () => {
  const { context, $ } = harness();
  context.state.growthEntries = [{ id: 'sleep-source', babyId: 'baby', date: '2026-10-13', time: '23:00', category: '수면', title: '원본', sleepMinutes: 120 }];
  context.renderGrowthList();
  const row = $('#growthList').rows[0];
  const updated = { ...context.state.growthEntries[0], title: '수정된 원본', sleepMinutes: 180 };
  context.state.growthEntries[0] = updated;
  row.click();
  expect(context.openGrowthDialog).toHaveBeenCalledWith(updated);
  expect(context.openGrowthDialog.mock.calls[0][0]).toBe(updated);
});
