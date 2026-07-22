import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../night-theme-polish.css', import.meta.url), 'utf8');
const parsedCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...parsedCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selectors: match[1].split(',').map((selector) => selector.trim()),
  body: match[2].replace(/\s+/g, ' ').trim(),
}));

function expectDeclarations(selector, declarations) {
  const rule = rules.find((candidate) => candidate.selectors.includes(selector));
  expect(rule, `missing CSS rule for ${selector}`).toBeDefined();

  for (const [property, value] of Object.entries(declarations)) {
    expect(rule.body, `${selector} must set ${property}`).toContain(`${property}: ${value};`);
  }
}

describe('moonlit storybook growth surface', () => {
  it('defines the complete night-only growth palette and background', () => {
    expectDeclarations('html[data-family-theme="night"] #growthView', {
      '--moonlit-gold': '#e8c77a',
      '--moonlit-teal': '#78b7b2',
      '--moonlit-paper': 'rgba(14, 34, 57, .88)',
      '--moonlit-border': 'color-mix(in srgb, var(--moonlit-gold) 28%, rgba(138, 180, 222, .18))',
      'background': 'radial-gradient(circle at 92% 4%, rgba(232, 199, 122, .10) 0 2px, transparent 3px), radial-gradient(ellipse at 8% 18%, rgba(120, 183, 178, .10), transparent 34%)',
    });
  });

  it('applies the parchment surface to every core card with effective timer specificity', () => {
    const cardDeclarations = {
      'border-color': 'var(--moonlit-border)',
      'background': 'linear-gradient(145deg, rgba(24, 52, 83, .92), var(--moonlit-paper))',
      'box-shadow': '0 20px 48px rgba(0, 0, 0, .30), inset 0 1px 0 rgba(255, 245, 216, .08)',
    };
    const cardSelectors = [
      'html[data-family-theme="night"] #growthView .baby-care-card',
      'html[data-family-theme="night"] #growthView #careTimerCard.care-timer-card',
      'html[data-family-theme="night"] #growthView .growth-quick-section',
      'html[data-family-theme="night"] #growthView .care-pattern-section',
      'html[data-family-theme="night"] #growthView .baby-ai-assistant',
      'html[data-family-theme="night"] #growthView .recent-photo-featured',
    ];

    for (const selector of cardSelectors) expectDeclarations(selector, cardDeclarations);
  });

  it('adds an independent sticker edge to live quick buttons without replacing category colors', () => {
    expectDeclarations('html[data-family-theme="night"] #growthView #careTimerCard .growth-quick-grid button', {
      'position': 'relative',
      'isolation': 'isolate',
    });
    expectDeclarations('html[data-family-theme="night"] #growthView #careTimerCard .growth-quick-grid button::after', {
      'content': '""',
      'position': 'absolute',
      'inset': '-1px',
      'border': '1px solid',
      'border-color': 'color-mix(in srgb, var(--moonlit-teal) 30%, transparent)',
      'border-radius': 'inherit',
      'box-shadow': '3px 4px 0 rgba(4, 14, 27, .34), inset 0 1px 0 rgba(255, 255, 255, .08)',
      'pointer-events': 'none',
    });
  });

  it('draws the decorative growth divider with gradients and no text glyph', () => {
    expectDeclarations('html[data-family-theme="night"] #growthView #babyJournalContent > section::before', {
      'content': '""',
      'position': 'static',
      'inset': 'auto',
      'z-index': 'auto',
      'display': 'block',
      'width': 'auto',
      'height': '9px',
      'margin': '-9px 18% 16px',
      'background': 'linear-gradient(90deg, transparent 0, var(--moonlit-gold) 18%, var(--moonlit-gold) 46%, transparent 46%, transparent 54%, var(--moonlit-gold) 54%, var(--moonlit-gold) 82%, transparent 100%), linear-gradient(45deg, transparent 42%, var(--moonlit-gold) 42%, var(--moonlit-gold) 58%, transparent 58%), linear-gradient(-45deg, transparent 42%, var(--moonlit-gold) 42%, var(--moonlit-gold) 58%, transparent 58%)',
      'background-size': '100% 1px, 9px 9px, 9px 9px',
      'background-position': 'center',
      'background-repeat': 'no-repeat',
      'pointer-events': 'none',
      'animation': 'none',
      'transform': 'none',
    });
  });
});
