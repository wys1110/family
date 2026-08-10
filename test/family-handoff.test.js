import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const todoSource = read('family-todo.js');
const config = read('config.js');

describe('family handoff command center', () => {
  test('current baby care and overdue or due-today todo determine the handoff priority', () => {
    const source = read('family-handoff.js');

    expect(source).toContain('const activeBabyEntries = () =>');
    expect(source).toContain('todo => !todo.completed && todo.dueDate && todo.dueDate <= today');
    expect(source).toContain('window.FAMILY_HANDOFF_API = { getSnapshot }');
  });

  test('reuses existing growth, todo, and calendar actions', () => {
    const source = read('family-handoff.js');

    expect(source).toContain('data-family-handoff-action');
    expect(source).toContain('window.FAMILY_TODO_API?.toggle?.(snapshot.priorityTodo.id)');
    expect(source).toContain("document.querySelector('[data-view=\"growth\"]')?.click()");
    expect(todoSource).toContain('toggle: (id) => toggleTodo(moduleState.todos.find((todo) => todo.id === id))');
  });

  test('refreshes from existing family events and uses a mobile-safe module style', () => {
    const source = read('family-handoff.js');
    const css = read('family-handoff.css');

    expect(source).toContain("'family:todo-snapshot-changed'");
    expect(source).toContain("'family:growth-entry-saved'");
    expect(source).toContain("'familycontextchange'");
    expect(source).toContain("const hero = document.querySelector('#calendarView .hero-card');");
    expect(source).toContain("hero.insertAdjacentElement('afterend', card)");
    expect(source).toContain('class="family-handoff-heading"');
    expect(css).toContain('.family-handoff-heading');
    expect(css).toContain('min-height: 44px');
    expect(config).toContain('{ name: "family-handoff", version: "20260810-v1" }');
  });
});
