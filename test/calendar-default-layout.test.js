import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const source = readFileSync('app.js', 'utf8');
function fixture() {
  const buttons = ['month', 'list'].map(layout => ({
    dataset: { calendarLayout: layout }, attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
  }));
  let onClick;
  const nodes = {
    '#calendarViewControls': { addEventListener: (_, fn) => { onClick = fn; }, querySelectorAll: () => buttons },
    '#calendarMonthView': {}, '#calendarMonthListView': {},
  };
  const context = {
    Date, DEFAULT_FAMILY_MEMBERS: [], startOfMonth: date => date,
    dateKey: () => '2026-11-02', storedActiveView: () => 'calendar',
    storedGrowthSummaryPeriod: () => 'day', readLocalWallpapers: () => ({}),
    $: selector => nodes[selector],
  };
  vm.createContext(context);
  vm.runInContext(source.match(/^const state = .*;$/m)[0] + '\nthis.state = state;', context);
  const display = source.slice(source.indexOf('  const listOpen = state.calendarLayout'),
    source.indexOf('  renderCalendarMonthList();', source.indexOf('function renderCalendar()')));
  vm.runInContext('function renderCalendar() {' + display + '}', context);
  const bindingStart = source.indexOf('  $("#calendarViewControls").addEventListener("click"');
  vm.runInContext(source.slice(bindingStart, source.indexOf('\n  });', bindingStart) + 6), context);
  context.renderCalendar();
  return { context, nodes, buttons, click: layout => onClick({ target: { closest: () => buttons.find(b => b.dataset.calendarLayout === layout) } }) };
}

test('calendar starts in month view with matching accessible controls', () => {
  const f = fixture();
  expect(f.context.state.calendarLayout).toBe('month');
  expect(f.nodes['#calendarMonthView'].hidden).toBe(false);
  expect(f.nodes['#calendarMonthListView'].hidden).toBe(true);
  expect(f.buttons[0].attrs['aria-pressed']).toBe('true');
  expect(f.buttons[1].attrs['aria-pressed']).toBe('false');
});

test('calendar keeps list/month switching available after the new default', () => {
  const f = fixture();
  f.click('list');
  expect(f.context.state.calendarLayout).toBe('list');
  expect(f.nodes['#calendarMonthView'].hidden).toBe(true);
  expect(f.nodes['#calendarMonthListView'].hidden).toBe(false);
  f.click('month');
  expect(f.context.state.calendarLayout).toBe('month');
  expect(f.nodes['#calendarMonthView'].hidden).toBe(false);
  expect(f.buttons[0].attrs['aria-pressed']).toBe('true');
});
