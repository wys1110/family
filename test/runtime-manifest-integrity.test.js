import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const config = readFileSync('config.js', 'utf8');
const serviceWorker = readFileSync('service-worker.js', 'utf8');
const modules = [...config.matchAll(/\{ name: "([^"]+)"([^}]*)\}/g)].map(([, name, options]) => ({
  name,
  style: !options.includes('style: false'),
  script: !options.includes('script: false'),
}));

describe('runtime manifest integrity', () => {
  test('every active manifest asset exists', () => {
    for (const module of modules) {
      if (module.style) expect(existsSync(`${module.name}.css`), `${module.name}.css`).toBe(true);
      if (module.script) expect(existsSync(`${module.name}.js`), `${module.name}.js`).toBe(true);
    }
  });

  test('contains no inactive or retired product paths', () => {
    expect(modules.every((module) => module.style || module.script)).toBe(true);
    for (const retired of ['growth-history-edit', 'storybook-theme', 'ghibli-theme', 'private-space', 'language-practice']) {
      expect(config).not.toContain(retired);
      expect(serviceWorker).not.toContain(retired);
    }
  });
});
