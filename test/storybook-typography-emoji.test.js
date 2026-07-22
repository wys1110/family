import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('storybook typography and emoji system', () => {
  it('self-hosts only the approved SUIT font asset and notice', () => {
    expect(existsSync(new URL('../assets/fonts/MaruBuri-SemiBold.woff2', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../assets/fonts/SUIT-Variable.woff2', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../assets/fonts/LICENSE-MaruBuri.md', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../assets/fonts/LICENSE-SUIT.txt', import.meta.url))).toBe(true);
  });

  it('aliases the display role to the SUIT UI font stack', () => {
    const css = read('typography-system.css');
    expect(css).not.toContain('font-family: "Family Story Display"');
    expect(css).toContain('font-family: "Family UI"');
    expect(css).toContain('--font-family-display: var(--font-family-sans)');
    expect(css).toContain('--font-family-sans: "Family UI"');
    expect(css).toMatch(/#growthView \.growth-page-header h2,[\s\S]*?#settingsView \.settings-heading h2 \{\s*font-family: var\(--font-family-display\);\s*font-weight: 700;\s*\}/);
  });

  it('uses the approved navigation emoji', () => {
    const script = read('tab-emojis.js');
    expect(script).toContain("growth: ['🌱', '성장']");
    expect(script).toContain("settings: ['🎨', '설정']");
  });

  it('bumps the dynamic module versions so browsers receive the new design', () => {
    const config = read('config.js');
    expect(config).toContain('{ name: "growth-dedup", version: "20260722-heading-icon-v1" }');
    expect(config).toContain('{ name: "tab-emojis", version: "20260722-storybook-v2" }');
    expect(config).toContain('{ name: "typography-system", version: "20260722-touch-target-v2", script: false }');
    expect(config).toContain('{ name: "night-theme-polish", version: "20260722-growth-restraint-v1" }');
  });

  it('keeps growth heading emoji above the ID-scoped SUIT span rule in the cascade', () => {
    const emojiCss = read('tab-emojis.css');
    const typographyCss = read('typography-system.css');

    expect(typographyCss).toMatch(/#growthView :is\([^)]*span[^)]*\) \{[\s\S]*?font-family: var\(--font-family-sans\);/);
    expect(emojiCss).toMatch(/\.app-shell #growthView \.storybook-heading-icon \{[\s\S]*?font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;[\s\S]*?font-size: 0\.72em;[\s\S]*?font-weight: 400;[\s\S]*?line-height: 1;/);
    expect(emojiCss).not.toContain('!important');
  });

  it('keeps section emoji decorative and text headings intact', () => {
    const html = read('index.html');
    expect(html).toContain('class="storybook-heading-icon" aria-hidden="true">✨</span>AI 육아 도우미');
    expect(html).toContain('class="storybook-heading-icon" aria-hidden="true">🌱</span>성장일기');
    expect(html).toContain('class="storybook-heading-icon" aria-hidden="true">📷</span>최근 사진');
  });

  it('marks the replaced typography documents as superseded by the SUIT-only moonlit decision', () => {
    const oldSpecTop = read('docs/superpowers/specs/2026-07-22-storybook-typography-emoji-design.md').split('\n').slice(0, 6).join('\n');
    const oldPlanTop = read('docs/superpowers/plans/2026-07-22-storybook-typography-emoji.md').split('\n').slice(0, 6).join('\n');

    expect(oldSpecTop).toContain('Superseded by: [Family 별빛 동화책 성장 화면 설계](./2026-07-22-moonlit-storybook-growth-design.md)');
    expect(oldPlanTop).toContain('Superseded by: [Moonlit Storybook Growth Implementation Plan](./2026-07-22-moonlit-storybook-growth.md)');
  });
});
