import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync('family-todo.js', 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
function harness() {
  const context = { household: { id: 'home' }, session: { user: { id: 'user-a' } } };
  const storage = new Map();
  const original = { id: 'original', title: 'Original', visibility: 'private' };
  let finishImport;
  let importStarted;
  const importReady = new Promise((resolve) => { importStarted = resolve; });
  const remote = [];
  const chain = { select() { return this; }, eq() { return this; }, order() { return this; } };
  context.supabase = { from: vi.fn(() => ({ ...chain, upsert(rows) {
    importStarted();
    return new Promise((resolve, reject) => { finishImport = (error, throws = false) => {
      if (throws) return reject(error);
      if (!error) remote.push(...rows);
      resolve({ error });
    }; });
  } })) };
  const h = {
    importReady, LOCAL_KEY: 'family-todos-v1', moduleState: { loading: false, loadId: 0, loaded: true, todos: [original], storage: 'local', busyIds: new Set() },
    familyContext: () => context, waitForFamilyContext: async () => context,
    contextKey: () => `${context.session.user.id}:${context.household.id}`,
    withAuthRecovery: (operation) => operation(),
    window: { FAMILY_DATA: { readAll: async () => ({ data: [...remote], error: null }) } },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    normalizeTodo: (todo) => ({ ...todo }), toRemote: (todo) => todo,
    renderTodos: vi.fn(), decorateCalendar: vi.fn(), updateStorageNote: vi.fn(), announce: vi.fn(),
    isMissingTable: () => false, uid: () => 'new', openTodoDialog: vi.fn(),
  };
  vm.createContext(h);
  vm.runInContext(section('  function localKey(', '  async function waitForFamilyContext('), h);
  vm.runInContext(section('  function readLocalTodos(', '  function toRemote('), h);
  vm.runInContext(section('  function assertTodoWritable(', '  async function loadTodos('), h);
  vm.runInContext(section('  async function loadTodos(', '  function recurrenceLabel('), h);
  vm.runInContext(section('  window.FAMILY_TODO_API = {', '  function decorateCalendar('), h);
  vm.runInContext(section('  async function toggleTodo(', "  subnav.addEventListener('click'"), h);
  storage.set(h.localKey(), JSON.stringify([original]));
  return { h, storage, context, original, remote, finish: (error = null, throws = false) => finishImport(error, throws) };
}

async function startImport(h) {
  const pending = h.loadTodos();
  await h.importReady;
  return { pending };
}

test('local private todo keys isolate users and households without claiming legacy rows', () => {
  const { h, context, storage, original } = harness();
  expect(h.localKey()).toBe('family-todos-v1:user-a:home');
  expect(h.localKey({ ...context, session: { user: { id: 'user-b' } } })).not.toBe(h.localKey());
  expect(h.localKey({ ...context, household: { id: 'other' } })).not.toBe(h.localKey());
  context.session = { user: { id: 'user-b' } };
  expect(h.readLocalTodos()).toEqual([]);
  h.writeLocalTodos([{ id: 'user-b-todo', visibility: 'private' }]);
  context.session = { user: { id: 'user-a' } };
  expect(h.readLocalTodos()).toEqual([original]);
  expect(storage.size).toBe(2);
  expect(source).not.toContain('claimLegacyLocalTodos');
});

test('pending local import rejects create, edit, delete and backup mutations; snapshots stay readable', async () => {
  const x = harness(); const { pending } = await startImport(x.h);
  await expect(x.h.createTodo({ title: 'Second' })).rejects.toMatchObject({ code: 'FAMILY_TODOS_LOADING' });
  await expect(x.h.updateTodo('original', { title: 'Changed' })).rejects.toMatchObject({ code: 'FAMILY_TODOS_LOADING' });
  await expect(x.h.deleteTodo('original')).rejects.toMatchObject({ code: 'FAMILY_TODOS_LOADING' });
  expect(() => x.h.window.FAMILY_TODO_API.restoreFamilyBackup([])).toThrow();
  await x.h.window.FAMILY_TODO_API.toggle('original');
  expect(x.h.window.FAMILY_TODO_API.getSnapshot()).toEqual([x.original]);
  x.h.window.FAMILY_TODO_API.open(x.original);
  expect(x.h.openTodoDialog).toHaveBeenCalledWith(x.original);
  expect(x.h.announce).toHaveBeenCalledWith('할 일을 불러오는 중이에요. 잠시 후 다시 시도해 주세요.');
  expect(x.h.moduleState.busyIds.size).toBe(0);
  x.finish(); await pending;
  expect(x.h.moduleState.todos).toEqual([x.original]);
  expect(x.remote).toEqual([x.original]);
  expect(x.h.moduleState.loading).toBe(false);
});

test.each([false, true])('import failure preserves local rows and releases loading (throws=%s)', async (throws) => {
  const x = harness(); const before = x.storage.get(x.h.localKey());
  const { pending } = await startImport(x.h);
  x.finish(new Error('Offline'), throws); await pending;
  expect(x.storage.get(x.h.localKey())).toBe(before);
  expect(x.h.moduleState.todos).toEqual([x.original]);
  expect(x.h.moduleState.storage).toBe('local');
  expect(x.h.moduleState.loading).toBe(false);
});

test('failed import leaves local mutations usable for a retry', async () => {
  const x = harness(); const { pending } = await startImport(x.h);
  x.finish(new Error('Offline')); await pending;
  await x.h.createTodo({ title: 'New local task' });
  expect(x.h.readLocalTodos().map((todo) => todo.id)).toEqual(['new', 'original']);
  await x.h.updateTodo('original', { title: 'Edited locally' });
  expect(x.h.readLocalTodos().find((todo) => todo.id === 'original').title).toBe('Edited locally');
  await x.h.deleteTodo('new');
  expect(x.h.readLocalTodos().map((todo) => todo.id)).toEqual(['original']);
});

function localRestoreHarness(x) {
  const settings = readFileSync('settings-family-management.js', 'utf8');
  const h = x.h;
  Object.assign(h, {
    state: { events: [], growthEntries: [], babies: [], familyMembers: [] },
    backupApi: { isDuplicateBackup: () => false }, readImportedBackups: () => [],
    writeJson: vi.fn(), markBackupImportedLocally: vi.fn(),
    LOCAL_KEYS: { events: 'events', growth: 'growth', babies: 'babies', members: 'members' },
    crypto: { randomUUID: () => 'restored' },
  });
  vm.runInContext(settings.slice(settings.indexOf('  const newId ='), settings.indexOf('  const restoreRemote =')) + '\nthis.restoreLocal = restoreLocal;', h);
  return {
    babies: [{ id: 'baby', name: 'Baby' }], events: [{ title: 'Event', event_date: '2026-10-18' }],
    growth_entries: [{ baby_id: 'baby', title: 'Growth' }], calendar_members: [{ name: 'Member' }],
    family_todos: [{ title: 'Restored task', visibility: 'family' }],
  };
}

test('local backup preflights todo loading before changing any other table or key', async () => {
  const x = harness(); const tables = localRestoreHarness(x);
  const before = JSON.stringify(x.h.state); const stored = [...x.storage];
  const { pending } = await startImport(x.h);
  expect(() => x.h.restoreLocal(tables, { householdId: 'home' }, 'backup')).toThrow();
  expect(JSON.stringify(x.h.state)).toBe(before);
  expect([...x.storage]).toEqual(stored);
  expect(x.h.writeJson).not.toHaveBeenCalled();
  expect(x.h.markBackupImportedLocally).not.toHaveBeenCalled();
  x.finish(); await pending;
});

test('local backup restores all tables once todo loading has finished', async () => {
  const x = harness(); const tables = localRestoreHarness(x);
  const { pending } = await startImport(x.h); x.finish(); await pending;
  expect(x.h.restoreLocal(tables, { householdId: 'home' }, 'backup')).toEqual({ duplicate: false });
  expect(x.h.state.events).toHaveLength(1);
  expect(x.h.state.growthEntries).toHaveLength(1);
  expect(x.h.state.babies).toHaveLength(1);
  expect(x.h.state.familyMembers).toHaveLength(1);
  expect(x.h.writeJson).toHaveBeenCalledTimes(4);
  expect(x.h.moduleState.todos.map((todo) => todo.title)).toEqual(['Original', 'Restored task']);
  expect(x.h.markBackupImportedLocally).toHaveBeenCalledWith('home', 'backup');
});
