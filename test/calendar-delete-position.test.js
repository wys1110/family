import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const app = readFileSync('app.js', 'utf8');
const source = app.slice(app.indexOf('async function deleteEvent()'), app.indexOf('function persistLocal()'));
function harness({ confirmed = true, remoteError = false } = {}) {
  const frame = [];
  const position = { x: 0, y: 1292, view: 'calendar' };
  const state = { activeView: 'calendar', selectedDate: '2026-11-18', viewDate: '2026-11', events: [{ id: 'delete' }, { id: 'keep' }] };
  const selected = { focus: vi.fn() };
  const dialog = { open: true, close: vi.fn(() => { dialog.open = false; window.scrollTo({ top: 0 }); }) };
  const window = { scrollTo: vi.fn() };
  if (remoteError) {
    const query = { delete: () => query, eq: () => query, then: resolve => resolve({ error: new Error('offline') }) };
    Object.assign(state, { supabase: { from: () => query }, session: {}, household: { id: 'family' } });
  }
  const context = { state, eventDialogReturnPosition: position, window, confirm: () => confirmed,
    $: selector => selector === '#eventId' ? { value: 'delete' } : selector === '#eventDialog' ? dialog : selected,
    withAuthRecovery: fn => fn(), requestAnimationFrame: fn => frame.push(fn),
    persistLocal: vi.fn(), renderHeader: vi.fn(), renderCalendar: vi.fn(), renderAgenda: vi.fn(), renderUpcomingEvents: vi.fn(), toast: vi.fn(),
    render: () => { throw new Error('Must not remount the whole app'); },
  };
  vm.createContext(context); vm.runInContext(source, context);
  return { context, frame, state, selected, dialog, window };
}

test('deleting preserves the selected day/month and restores scroll after dialog focus reset', async () => {
  const h = harness(); await h.context.deleteEvent(); h.frame.forEach(fn => fn());
  expect(h.state.events).toEqual([{ id: 'keep' }]);
  expect(h.state.selectedDate).toBe('2026-11-18'); expect(h.state.viewDate).toBe('2026-11');
  expect(h.window.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 1292, behavior: 'instant' });
  expect(h.selected.focus).toHaveBeenCalledWith({ preventScroll: true });
});

for (const options of [{ confirmed: false }, { remoteError: true }]) {
  test(`cancelled or failed deletion keeps the editor and records: ${JSON.stringify(options)}`, async () => {
    const h = harness(options); await h.context.deleteEvent();
    expect(h.state.events).toHaveLength(2); expect(h.dialog.open).toBe(true);
    expect(h.context.persistLocal).not.toHaveBeenCalled(); expect(h.window.scrollTo).not.toHaveBeenCalled();
  });
}

test('a queued focus restoration does not pull the user back from another tab', async () => {
  const h = harness(); await h.context.deleteEvent(); h.window.scrollTo.mockClear();
  h.state.activeView = 'growth'; h.frame.forEach(fn => fn());
  expect(h.window.scrollTo).not.toHaveBeenCalled(); expect(h.selected.focus).not.toHaveBeenCalled();
});
