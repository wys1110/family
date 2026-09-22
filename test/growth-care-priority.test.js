import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const index = readFileSync('index.html', 'utf8');
const app = readFileSync('app.js', 'utf8');

describe('growth care priority', () => {
  test('shows the care pattern before photos and the recent-record timeline', () => {
    const pattern = index.indexOf('<section class="care-pattern-section"');
    expect(pattern).toBeGreaterThan(-1);
    expect(pattern).toBeLessThan(index.indexOf('<section class="recent-photo-section recent-photo-featured"'));
    expect(pattern).toBeLessThan(index.indexOf('<section class="growth-section"'));
  });

  test('keeps the care summary open without a collapse control', () => {
    expect(index).toContain('<div class="growth-summary-body" id="growthSummaryBody">');
    expect(index).not.toContain('id="growthSummaryToggle"');
    expect(app).toContain('$("#growthSummaryBody").hidden = false;');
    expect(app).not.toContain('growthSummaryExpanded');
  });
});
