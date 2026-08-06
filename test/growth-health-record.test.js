import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.js', 'utf8');
const index = readFileSync('index.html', 'utf8');

describe('health symptom growth records', () => {
  test('health record controls exist', () => {
    expect(index).toContain('growthSymptom');
    expect(app).toContain('구토 기록');
    expect(app).toContain('아픈 기록을 바로 남겨요');
  });
});
