import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';
const adaptive = readFileSync('adaptive-feeding.js', 'utf8');
const classifier = adaptive.slice(adaptive.indexOf('  function typeOf(entry)'), adaptive.indexOf('\n  function entries()'));
const reminder = readFileSync('feeding-reminder.js', 'utf8');
const entries = [
  { id: 'formula', babyId: 'baby', category: '수유·이유식', feedingType: '분유', date: '2000-01-01', time: '08:00', feedingMl: 120, feedingMinutes: 10 },
  { id: 'pumped', babyId: 'baby', category: '수유·이유식', feedingType: '유축모유', date: '2000-01-01', time: '09:00', feedingMl: 90, feedingMinutes: 12 },
  { id: 'breast', babyId: 'baby', category: '수유·이유식', feedingType: '모유', date: '2000-01-01', time: '10:00', feedingMinutes: 18, feedingMl: 999 },
  { id: 'solid', babyId: 'baby', category: '수유·이유식', feedingType: '이유식', date: '2000-01-01', time: '11:00', feedingMl: 60, feedingMinutes: 7 },
  { id: 'legacy-solid', babyId: 'baby', category: '수유·이유식', title: '이유식', date: '2000-01-01', time: '12:00', feedingMl: 30 },
];
test.each([['formula', 'formula'], ['breast', 'breast'], ['all', 'breast']])('%s reminder ignores later solid-food records', (target, expected) => {
  const context = { state: { activeBabyId: 'baby', growthEntries: entries }, reminder: { target } };
  vm.createContext(context);
  vm.runInContext(`${classifier}\nconst growthCareType = typeOf;\n${reminder.slice(reminder.indexOf('  const feedingTypeOf'), reminder.indexOf('  const targetLabel'))}\nglobalThis.latest = latestMatchingEntry();`, context);
  expect(context.latest.entry.id).toBe(expected);
});
test('expressed breast milk remains eligible for breast/all reminders and not formula', () => {
  const context = { state: { activeBabyId: 'baby', growthEntries: entries.filter(e => ['formula', 'pumped', 'solid'].includes(e.id)) }, reminder: { target: 'breast' } };
  vm.createContext(context);
  vm.runInContext(`${classifier}\nconst growthCareType = typeOf;\n${reminder.slice(reminder.indexOf('  const feedingTypeOf'), reminder.indexOf('  const targetLabel'))}\nglobalThis.latest = latestMatchingEntry();`, context);
  expect(context.latest.entry.id).toBe('pumped');
});
test('clinic summary counts only bottle milk and direct breastfeeding time', () => {
  const context = { window: {} }; vm.createContext(context);
  vm.runInContext(`${classifier}\nconst growthCareType = typeOf;`, context);
  vm.runInContext(readFileSync('family-data.js', 'utf8'), context);
  vm.runInContext(readFileSync('family-journal.js', 'utf8'), context);
  const summary = context.window.FAMILY_JOURNAL.summarize(entries, '2000-01-01', '2000-01-02');
  expect(summary.days[0]).toMatchObject({ feedingMl: 210, feedingCount: 2, breastMinutes: 18, recordCount: 5 });
  expect(summary.days[1]).toMatchObject({ feedingMl: null, breastMinutes: null });
  const html = context.window.FAMILY_JOURNAL.reportHtml({ name: '합성 아기' }, summary, '2000-01-01', '2000-01-02');
  expect(html).toContain('210 ml'); expect(html).toContain('18분');
});
