import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = readFileSync(new URL('../refresh-button.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../refresh-button.css', import.meta.url), 'utf8');
const config = readFileSync(new URL('../config.js', import.meta.url), 'utf8');

describe('growth AI floating action safe zone', () => {
  it('observes the AI assistant and exposes one shared body state', () => {
    expect(script).toContain("document.querySelector('#babyAiAssistant')");
    expect(script).toContain('new IntersectionObserver');
    expect(script).toContain("pageBody.classList.toggle('floating-actions-safe-zone-active', entry.isIntersecting)");
    expect(script).toContain('observer.observe(aiAssistant)');
  });

  it('removes both floating actions from sight and interaction in the safe zone', () => {
    expect(css).toContain('body.floating-actions-safe-zone-active > #addEventButton.fab');
    expect(css).toContain('body.floating-actions-safe-zone-active > .refresh-button');
    expect(css).toContain('visibility: hidden;');
    expect(css).toContain('opacity: 0;');
    expect(css).toContain('pointer-events: none;');
  });

  it('loads the updated JavaScript and CSS instead of the previous cached module', () => {
    expect(config).toContain('{ name: "refresh-button", version: "20260722-growth-safe-zone-v1" }');
  });
});
