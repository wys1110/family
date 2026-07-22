import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../night-theme-polish.css', import.meta.url), 'utf8');

describe('moonlit storybook growth surface', () => {
  it('defines a night-only growth palette', () => {
    expect(css).toContain('html[data-family-theme="night"] #growthView {');
    expect(css).toContain('--moonlit-gold: #e8c77a');
    expect(css).toContain('--moonlit-teal: #78b7b2');
    expect(css).toContain('--moonlit-paper: rgba(14, 34, 57, .88)');
  });

  it('styles the core growth cards and quick actions', () => {
    expect(css).toContain('html[data-family-theme="night"] #growthView .baby-care-card');
    expect(css).toContain('html[data-family-theme="night"] #growthView .baby-ai-assistant');
    expect(css).toContain('html[data-family-theme="night"] #growthView .growth-quick-grid button');
    expect(css).toContain('html[data-family-theme="night"] #babyJournalContent > section::before');
  });
});
