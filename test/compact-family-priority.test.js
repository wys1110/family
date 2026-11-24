import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const script = readFileSync('compact-family.js', 'utf8');
const config = readFileSync('config.js', 'utf8');
const index = readFileSync('index.html', 'utf8');

test('keeps care patterns expanded before the recent-record timeline', () => {
  expect(script).not.toContain("document.createElement('details')");
  expect(script).not.toContain('성장 분석 보기');
  expect(script).toContain("for (const selector of ['.care-pattern-section', '.integrated-care-summary', '#growthInsightRow'])");
  expect(script).toContain('beforeHistory.after(history);');
});

test('keeps the record action in growth without adding a header above the calendar', () => {
  expect(index).toContain('body:has(#appShell[aria-busy="true"]) > #addEventButton { visibility: hidden; }');
  expect(script).toContain("growthActions.appendChild($('#addEventButton'))");
  expect(script).toContain('timer.appendChild(growthActions)');
  expect(script).not.toContain('calendar-page-header');
  expect(config).toContain('{ name: "compact-family", version: "20261124-growth-record-action-v1" }');
});
