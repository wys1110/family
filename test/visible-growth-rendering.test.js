import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync('app.js', 'utf8');
function harness(activeView = 'calendar') {
  const nodes = new Map();
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      hidden: false, classList: { contains: () => false }, setAttribute: vi.fn(),
    });
    return nodes.get(selector);
  };
  const tabs = ['calendar', 'growth'].map(view => ({
    dataset: { view }, classList: { toggle: vi.fn() }, setAttribute: vi.fn(),
  }));
  const state = { activeView, growthEntries: [], activeBabyId: 'a' };
  const rendered = [];
  const context = {
    state, $, document: { querySelectorAll: () => tabs }, ACTIVE_VIEW_KEY: 'demo-view',
    localStorage: { setItem: vi.fn() }, closePhotoAlbum: vi.fn(),
    renderHeader: vi.fn(), renderMemberControls: vi.fn(), renderCalendar: vi.fn(),
    renderAgenda: vi.fn(), renderUpcomingEvents: vi.fn(), renderWallpapers: vi.fn(), updateSyncBadge: vi.fn(),
    renderGrowth: vi.fn(() => rendered.push({ baby: state.activeBabyId, records: [...state.growthEntries] })),
  };
  vm.createContext(context);
  const renderStart = source.indexOf('function render()');
  vm.runInContext(source.slice(renderStart, source.indexOf('\nfunction ', renderStart + 1)), context);
  const switchStart = source.indexOf('function switchView(');
  vm.runInContext(source.slice(switchStart, source.indexOf('\nfunction publicHolidayEvent', switchStart)), context);
  return { context, state, $, rendered };
}

test('calendar refresh does not calculate hidden growth history', () => {
  const { context } = harness();
  context.render();
  expect(context.renderGrowth).not.toHaveBeenCalled();
  expect(context.renderCalendar).toHaveBeenCalledOnce();
  expect(context.renderMemberControls).toHaveBeenCalledOnce();
});

test('direct and saved growth entry each render once after making the view visible', () => {
  const { context, $ } = harness('growth');
  context.render();
  expect(context.renderGrowth).toHaveBeenCalledOnce();
  expect($('#growthView').hidden).toBe(false);
  context.renderGrowth.mockClear();
  context.switchView('calendar');
  context.switchView('growth');
  expect(context.renderGrowth).toHaveBeenCalledOnce();
});

test('returning to growth reads changed baby and same-array photo updates', () => {
  const { context, state, rendered } = harness();
  const entry = { id: 'raw', babyId: 'a', photoUrls: [] };
  state.growthEntries.push(entry);
  context.render();
  state.activeBabyId = 'b';
  entry.photoUrls.push('new-photo');
  context.switchView('growth');
  expect(rendered).toEqual([{ baby: 'b', records: [entry] }]);
  expect(rendered[0].records[0]).toBe(entry);
});
