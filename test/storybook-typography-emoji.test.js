import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('storybook typography and emoji system', () => {
  it('self-hosts the approved font assets and notices', () => {
    expect(existsSync(new URL('../assets/fonts/MaruBuri-SemiBold.woff2', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../assets/fonts/SUIT-Variable.woff2', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../assets/fonts/LICENSE-MaruBuri.md', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../assets/fonts/LICENSE-SUIT.txt', import.meta.url))).toBe(true);
  });

  it('assigns separate storybook display and UI font roles', () => {
    const css = read('typography-system.css');
    expect(css).toContain('font-family: "Family Story Display"');
    expect(css).toContain('font-family: "Family UI"');
    expect(css).toContain('--font-family-display: "Family Story Display"');
    expect(css).toContain('--font-family-sans: "Family UI"');
  });

  it('uses the approved navigation emoji', () => {
    const script = read('tab-emojis.js');
    expect(script).toContain("growth: ['🌱', '성장']");
    expect(script).toContain("settings: ['🎨', '설정']");
  });

  it('bumps the dynamic module versions so browsers receive the new design', () => {
    const config = read('config.js');
    expect(config).toContain('{ name: "tab-emojis", version: "20260722-storybook-v1" }');
    expect(config).toContain('{ name: "typography-system", version: "20260722-storybook-v1", script: false }');
  });

  it('keeps section emoji decorative and text headings intact', () => {
    const html = read('index.html');
    expect(html).toContain('class="storybook-heading-icon" aria-hidden="true">✨</span>AI 육아 도우미');
    expect(html).toContain('class="storybook-heading-icon" aria-hidden="true">🌱</span>성장일기');
    expect(html).toContain('class="storybook-heading-icon" aria-hidden="true">📷</span>최근 사진');
  });
});
