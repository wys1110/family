import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const activityLog = readFileSync(new URL('../activity-log.js', import.meta.url), 'utf8');
const tabLoader = readFileSync(new URL('../tab-emojis.js', import.meta.url), 'utf8');

test('keeps activity logging available while hiding the settings disclosure', () => {
  expect(activityLog).toContain('const SHOW_ACTIVITY_DISCLOSURE = false;');
  expect(activityLog).toContain('if (SHOW_ACTIVITY_DISCLOSURE) installDisclosure();');
  expect(activityLog).toContain('window.FAMILY_ACTIVITY_LOG = logActivity;');
  expect(activityLog).toContain("logActivity('view_open', tab.dataset.view);");
});

test('bumps the activity log asset version for the hidden disclosure change', () => {
  expect(tabLoader).toContain("activity-log.js?v=20260803-settings-disclosure-v1");
});
