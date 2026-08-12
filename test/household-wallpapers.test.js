import { describe, expect, test } from 'vitest';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('app.js');
const html = read('index.html');
const migration = read('supabase/migrations/20260810005856_household_wallpapers.sql');
const css = read('family-wallpapers.css');
const config = read('config.js');

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

  test('keeps growth wallpaper neutral and profile text legible in white mode', () => {
    const growthSelector = '.baby-profile-card.wallpaper-surface.has-wallpaper[data-wallpaper-surface="growth"]';
    expect(css).toContain(growthSelector);
    expect(css).toMatch(/linear-gradient\(90deg,[^;]+var\(--wallpaper-image\)/s);
    expect(css).not.toContain('background-position: center 38%');
    expect(css).toContain(`${growthSelector}::before,`);
    expect(css).toContain(`${growthSelector}::after { content: none; }`);
    expect(css).toContain(`${growthSelector} :is(`);
    expect(css).toMatch(/\[data-wallpaper-surface="growth"\] :is\([^)]+\.baby-edit-button\s*\) \{ color: var\(--theme-wallpaper-text\) !important; \}/s);
    expect(css).toMatch(/\[data-wallpaper-surface="growth"\] \.baby-dday \{[^}]+background: var\(--theme-wallpaper-surface\) !important;/s);
  });

  test('shows the full calendar and growth wallpaper without cropping', () => {
    expect(css).toContain('background-position: center, right center;');
    expect(css).toContain('background-size: 100% 100%, contain;');
    expect(css).toContain('background-repeat: no-repeat;');
    expect(config).toContain('{ name: "family-wallpapers", version: "20260813-full-fit-v1", script: false }');
  });

  test('ships the contrast fix under a fresh wallpaper asset version', () => {
    expect(config).toContain('{ name: "family-wallpapers", version: "20260813-full-fit-v1", script: false }');
  });
});
