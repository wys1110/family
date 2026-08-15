import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const index = readFileSync('index.html', 'utf8');
const bootstrap = readFileSync('theme-bootstrap.js', 'utf8');
const critical = readFileSync('theme-critical.css', 'utf8');
const serviceWorker = readFileSync('service-worker.js', 'utf8');

describe('theme bootstrap prevents refresh flash', () => {
  test('runs the theme bootstrap before the base stylesheet', () => {
    expect(index.indexOf('theme-bootstrap.js')).toBeGreaterThanOrEqual(0);
    expect(index.indexOf('theme-bootstrap.js')).toBeLessThan(index.indexOf('styles.css'));
    expect(index).toContain('theme-critical.css');
    expect(index).toContain('data-theme-critical-inline');
  });

  test('resolves production and demo theme storage before body paint', () => {
    expect(bootstrap).toContain('family-theme-choice-v1');
    expect(bootstrap).toContain('family-demo-theme-choice-v1');
    expect(bootstrap).toContain('root.dataset.familyThemeChoice');
    expect(bootstrap).toContain('root.dataset.familyTheme');
    expect(bootstrap).toContain('window.FAMILY_THEME_BOOTSTRAP');
  });

  test('pins both theme canvases and legacy tokens in render-blocking CSS', () => {
    expect(critical).toContain('html[data-family-theme-choice="white"]');
    expect(critical).toContain('html[data-family-theme-choice="black"]');
    expect(critical).toContain('--bg: #f7f7f5');
    expect(critical).toContain('--bg: #050505');
    expect(critical).toContain('background-image:');
  });

  test('keeps wallpaper scrims brighter and identical across first-paint sources', () => {
    const values = [
      ['8', '8', '8', '.46'],
      ['8', '8', '8', '.24'],
      ['8', '8', '8', '.05'],
      ['4', '4', '4', '.58'],
      ['4', '4', '4', '.32'],
      ['4', '4', '4', '.08'],
    ];

    values.forEach(([red, green, blue, alpha]) => {
      const declaration = new RegExp(`rgba\\(${red},\\s*${green},\\s*${blue},\\s*\\${alpha}\\)`);
      expect(index).toMatch(declaration);
      expect(critical).toMatch(declaration);
    });
  });

  test('forces the bootstrap assets to network for installed-app refreshes', () => {
    expect(serviceWorker).toContain('url.pathname.endsWith("/theme-bootstrap.js")');
    expect(serviceWorker).toContain('url.pathname.endsWith("/theme-critical.css")');
  });
});
