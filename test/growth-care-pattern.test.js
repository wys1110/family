import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.js', 'utf8');
const split = readFileSync('feeding-pattern-split.js', 'utf8');
const weekly = readFileSync('weekly-care-summary.js', 'utf8');
const index = readFileSync('index.html', 'utf8');

describe('health care pattern', () => {
  test('health appears in base and split care patterns', () => {
    expect(app).toContain('return "health"');
    expect(index).toContain('data-pattern-category="health"');
    expect(split).toContain('"health"');
    expect(weekly).toContain('healthCount');
    expect(weekly).toContain('className: "health"');
  });
});
