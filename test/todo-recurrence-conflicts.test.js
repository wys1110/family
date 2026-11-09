import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync('family-todo.js', 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const duplicate = { code: '23505', message: 'duplicate key' };
const parent = { id: 'parent', title: 'Synthetic', completed: false, recurrence: 'daily', dueDate: '2026-11-09', visibility: 'family' };
const successor = { id: 'child', title: 'Synthetic', recurrence_parent_id: 'parent', visibility: 'family' };

function harness(existing = null, lookupError = null) {
  const filters = [];
  const query = {
    insert: vi.fn(function () { return this; }), select() { return this; },
    eq(key, value) { filters.push([key, value]); return this; },
    single: async () => ({ data: null, error: duplicate }),
    maybeSingle: async () => ({ data: existing, error: lookupError }),
  };
  const context = { household: { id: 'home' }, session: { user: { id: 'user' } }, supabase: { from: () => query } };
  const h = {
    moduleState: { storage: 'remote', todos: [{ ...parent }], busyIds: new Set() },
    assertTodoWritable() {}, familyContext: () => context,
    withAuthRecovery: operation => operation(),
    normalizeTodo: todo => ({ ...todo, parentId: todo.parentId ?? todo.recurrence_parent_id }),
    toRemote: todo => todo, uid: () => 'new', isMissingTable: () => false,
    renderTodos: vi.fn(), decorateCalendar: vi.fn(), announce: vi.fn(), writeLocalTodos: vi.fn(),
    updateTodo: vi.fn(async (id, patch) => ({ id, ...patch })),
    addRecurrence: () => '2026-11-10', recurrenceLabel: () => '매일',
  };
  vm.createContext(h);
  vm.runInContext(section('  async function createTodo(', '  function remotePatch('), h);
  vm.runInContext(section('  async function toggleTodo(', "  subnav.addEventListener('click'"), h);
  return { h, filters, query };
}

test('a hidden conflicting row is not treated as a successfully created successor', async () => {
  const { h, filters } = harness();
  await expect(h.createTodo({ title: 'Synthetic', parentId: 'parent' })).rejects.toEqual(duplicate);
  expect(filters).toEqual([['household_id', 'home'], ['recurrence_parent_id', 'parent']]);
  expect(h.moduleState.todos).toHaveLength(1);
  expect(h.announce).not.toHaveBeenCalled();
  expect(h.writeLocalTodos).not.toHaveBeenCalled();
});

test('a visible successor from a simultaneous completion is reused without duplication', async () => {
  const { h } = harness(successor);
  await expect(h.createTodo({ title: 'Synthetic', parentId: 'parent' })).resolves.toMatchObject({ id: 'child', parentId: 'parent' });
  await h.createTodo({ title: 'Synthetic', parentId: 'parent' });
  expect(h.moduleState.todos.filter(todo => todo.id === 'child')).toHaveLength(1);
});

test('unrelated uniqueness conflicts and failed lookups remain failures', async () => {
  const first = harness();
  await expect(first.h.createTodo({ title: 'Synthetic' })).rejects.toEqual(duplicate);
  expect(first.filters).toEqual([]);
  const offline = { code: 'OFFLINE' };
  const second = harness(null, offline);
  await expect(second.h.createTodo({ title: 'Synthetic', parentId: 'parent' })).rejects.toEqual(offline);
});

test('failed recurring completion rolls back and never announces a created successor', async () => {
  const { h } = harness();
  await h.toggleTodo({ ...parent });
  expect(h.updateTodo).toHaveBeenLastCalledWith('parent', { completed: false, completedAt: null }, { quiet: true });
  expect(h.announce).toHaveBeenCalledExactlyOnceWith('완료 상태를 변경하지 못했어요.');
  expect(h.moduleState.busyIds.size).toBe(0);
});
