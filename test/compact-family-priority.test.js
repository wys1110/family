import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const script = readFileSync('compact-family.js', 'utf8');
const config = readFileSync('config.js', 'utf8');

test('keeps care patterns expanded before the recent-record timeline', () => {
  expect(script).not.toContain("document.createElement('details')");
  expect(script).not.toContain('성장 분석 보기');
  expect(script).toContain("for (const selector of ['.care-pattern-section', '.integrated-care-summary', '#growthInsightRow'])");
  expect(script).toContain('beforeHistory.after(history);');
  expect(config).toContain('{ name: "compact-family", version: "20260922-pattern-priority-v2" }');
});
