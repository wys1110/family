import { describe, expect, test } from 'vitest';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('app.js');
const html = read('index.html');
const migration = read('supabase/migrations/20260810005856_household_wallpapers.sql');

describe('family wallpaper', () => {
  test('keeps one shared wallpaper per household and surface', () => {
    expect(migration).toContain("surface text not null check (surface in ('calendar', 'growth'))");
    expect(migration).toContain('primary key (household_id, surface)');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('public.is_household_owner(household_id)');
  });

  test('uses household-scoped storage paths and the active household only', () => {
    expect(app).toContain("`${state.household.id}/wallpapers/${surface}/");
    expect(app).toContain('from("household_wallpapers")');
    expect(app).toContain('row.household_id === householdId');
  });

  test('provides photo change controls on both hero surfaces', () => {
    expect(html).toContain('data-wallpaper-surface="calendar"');
    expect(html).toContain('data-wallpaper-surface="growth"');
    expect(html).toContain('id="wallpaperPhotoInput"');
  });
});
