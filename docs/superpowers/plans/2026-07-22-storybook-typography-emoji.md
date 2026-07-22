# Family Storybook Typography and Emoji Implementation Plan

> Superseded by: [Moonlit Storybook Growth Implementation Plan](./2026-07-22-moonlit-storybook-growth.md) — Follow the SUIT-only moonlit plan for the current implementation decision.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a first visible storybook-design slice by self-hosting MaruBuri and SUIT, applying clear display/body roles, and enriching the growth/AI screen and global navigation with consistent semantic emoji.

**Architecture:** Keep the static no-build app and existing asset order. Put font binaries and notices in `assets/fonts/`, extend the existing `typography-system.css` for font roles, extend `tab-emojis.js` and `tab-emojis.css` for emoji semantics, and add only accessible static heading spans in `index.html`.

**Tech Stack:** HTML5, CSS3, Vanilla JavaScript, WOFF2, Node.js, Vitest, headless browser

## Global Constraints

- Use self-hosted font files; do not add a CDN, package runtime, or build step.
- Use MaruBuri SemiBold only for display titles and SUIT Variable for body, controls, inputs, dates, times, and numbers.
- Keep emoji meaningful: one per section or action, at most two decorative emoji per card.
- Preserve textual accessible names and set decorative emoji to `aria-hidden="true"`.
- Do not add emoji to AI answers, medical safety copy, dates, quantities, or chart axes.
- Do not change Supabase, authentication, migrations, Edge Functions, AI content, or the intentional viewport zoom policy.
- Keep `HANDOFF.md` untracked and out of every commit.
- This first slice covers global navigation plus the growth/AI screen; other screens follow as independent reviewed changes.

---

### Task 1: Add a failing storybook design contract

**Files:**
- Create: `test/storybook-typography-emoji.test.js`

**Interfaces:**
- Consumes: `index.html`, `typography-system.css`, `tab-emojis.js`, `assets/fonts/`
- Produces: static contracts for self-hosted font assets, font roles, accessible heading emoji, and navigation emoji mapping

- [ ] **Step 1: Write the contract test**

```js
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

  it('keeps section emoji decorative and text headings intact', () => {
    const html = read('index.html');
    expect(html).toContain('class="storybook-heading-icon" aria-hidden="true">✨</span>AI 육아 도우미');
    expect(html).toContain('class="storybook-heading-icon" aria-hidden="true">🌱</span>성장일기');
    expect(html).toContain('class="storybook-heading-icon" aria-hidden="true">📷</span>최근 사진');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npx vitest run test/storybook-typography-emoji.test.js`

Expected: FAIL because the font assets, font roles, and approved emoji markup do not exist yet.

- [ ] **Step 3: Commit the failing contract**

```bash
git add test/storybook-typography-emoji.test.js
git commit -m "test: define storybook typography and emoji contract"
```

---

### Task 2: Self-host the approved fonts and define typography roles

**Files:**
- Create: `assets/fonts/MaruBuri-SemiBold.woff2`
- Create: `assets/fonts/SUIT-Variable.woff2`
- Create: `assets/fonts/LICENSE-MaruBuri.md`
- Create: `assets/fonts/LICENSE-SUIT.txt`
- Modify: `typography-system.css`

**Interfaces:**
- Consumes: official NAVER MaruBuri bundle and official `sun-typeface/SUIT` files
- Produces: `Family Story Display` weight 600 and `Family UI` variable weights 100–900

- [ ] **Step 1: Download and convert the official MaruBuri SemiBold asset**

Run from the repository root:

```bash
font_tmp=$(mktemp -d /tmp/family-story-font.XXXXXX)
curl -L https://hangeul.naver.com/hangeul_static/webfont/zips/maruburi.zip -o "$font_tmp/maruburi.zip"
ditto -x -k "$font_tmp/maruburi.zip" "$font_tmp/maruburi"
maru_ttf_zip=$(find "$font_tmp/maruburi" -type f -name 'MaruBuriTTF.zip' -print -quit)
unzip -j "$maru_ttf_zip" MaruBuri-SemiBold.ttf -d "$font_tmp"
python3 -m venv "$font_tmp/venv"
"$font_tmp/venv/bin/pip" install fonttools brotli
mkdir -p assets/fonts
"$font_tmp/venv/bin/pyftsubset" "$font_tmp/MaruBuri-SemiBold.ttf" --flavor=woff2 --output-file=assets/fonts/MaruBuri-SemiBold.woff2 --unicodes='*'
```

Expected: `assets/fonts/MaruBuri-SemiBold.woff2` exists and is non-empty.

- [ ] **Step 2: Download the official SUIT asset and license**

```bash
curl -L https://raw.githubusercontent.com/sun-typeface/SUIT/main/fonts/variable/woff2/SUIT-Variable.woff2 -o assets/fonts/SUIT-Variable.woff2
curl -L https://raw.githubusercontent.com/sun-typeface/SUIT/main/LICENSE -o assets/fonts/LICENSE-SUIT.txt
```

Expected: both files exist and are non-empty.

- [ ] **Step 3: Add the MaruBuri notice**

Create `assets/fonts/LICENSE-MaruBuri.md` with this exact content:

```markdown
# MaruBuri font notice

마루 부리 글꼴의 지적 재산권은 네이버와 네이버 문화재단에 있습니다.

- Official font page: <https://hangeul.naver.com/font>
- Full license terms: <https://help.naver.com/support/contents/contents.help?serviceNo=1074&categoryNo=3497>

네이버 글꼴은 개인 및 기업 사용자를 포함한 모든 사용자에게 무료로 제공되며 글꼴 자체를 유료로 판매하는 것을 제외한 상업적인 사용이 가능합니다.

네이버 글꼴은 본 저작권 안내와 라이선스 전문을 포함해서 다른 소프트웨어와 번들하거나 재배포 또는 판매가 가능하고 자유롭게 수정, 재배포할 수 있습니다. 라이선스 전문을 포함하기 어려울 경우 출처 표기를 권장합니다.

네이버 글꼴을 사용한 인쇄물과 온라인 광고물의 이미지는 나눔 글꼴 프로모션을 위해 활용될 수 있으며, 이를 원치 않는 사용자는 네이버에 요청할 수 있습니다.

마루 부리 글꼴은 나눔 글꼴과 같은 오픈 라이선스 조건을 적용받습니다. 정확한 사용 조건은 위의 공식 라이선스 전문 링크를 확인하세요.
```

- [ ] **Step 4: Define and apply the font roles in `typography-system.css`**

Add `@font-face` declarations before `:root`:

```css
@font-face {
  font-family: "Family Story Display";
  src: url("assets/fonts/MaruBuri-SemiBold.woff2") format("woff2");
  font-style: normal;
  font-weight: 600;
  font-display: swap;
}

@font-face {
  font-family: "Family UI";
  src: url("assets/fonts/SUIT-Variable.woff2") format("woff2");
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}
```

Replace the sans variable and add the display variable:

```css
--font-family-display: "Family Story Display", "Apple SD Gothic Neo", serif;
--font-family-sans: "Family UI", -apple-system, BlinkMacSystemFont,
  "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
```

Apply the display role after the shared sans rules so it wins without `!important`:

```css
.topbar h1,
.daily-verse-card blockquote,
#calendarView .hero-card h2,
#calendarView :is(.calendar-toolbar, .section-heading) h2,
#growthView .growth-page-header h2,
#growthView .baby-profile-copy h2,
#growthView .photo-album-header h2,
#growthView :is(.section-heading, .care-timer-heading, .care-pattern-heading, .growth-summary-header, .growth-chart-heading) h2,
#growthView .baby-ai-heading h2,
#englishView .english-page-header h2,
#englishView .english-story-cover h2,
#englishView .english-library-section h2,
#englishView .english-today-card h3,
#featureRequestView .feature-request-heading h2,
#featureRequestView .feature-request-admin-heading h2,
#settingsView .settings-heading h2 {
  font-family: var(--font-family-display);
  font-weight: 600;
}
```

Keep buttons, inputs, labels, numerical values, AI body copy, and chart text on `var(--font-family-sans)`.

- [ ] **Step 5: Run the focused test**

Run: `npx vitest run test/storybook-typography-emoji.test.js`

Expected: font-asset and font-role assertions pass; emoji assertions still fail.

- [ ] **Step 6: Commit the font foundation**

```bash
git add assets/fonts typography-system.css
git commit -m "style: add self-hosted storybook typography"
```

---

### Task 3: Apply semantic emoji to navigation and growth headings

**Files:**
- Modify: `tab-emojis.js`
- Modify: `tab-emojis.css`
- Modify: `index.html`

**Interfaces:**
- Consumes: existing `.view-tab-icon`, static growth headings, and the font roles from Task 2
- Produces: stable navigation emoji and reusable `.storybook-heading-icon` badges with decorative semantics

- [ ] **Step 1: Update the global navigation mapping**

Use this mapping in `tab-emojis.js`:

```js
const labels = {
  calendar: ['🗓️', '일정'],
  growth: ['🌱', '성장'],
  english: ['📖', '동화'],
  'feature-request': ['💡', '요청'],
  settings: ['🎨', '설정'],
};
```

- [ ] **Step 2: Add the reusable section-heading emoji badge**

Append to `tab-emojis.css`:

```css
.storybook-heading-icon {
  display: inline-grid;
  place-items: center;
  width: 1.65em;
  height: 1.65em;
  margin-right: .34em;
  border: 1px solid color-mix(in srgb, var(--blue) 24%, transparent);
  border-radius: 42% 58% 54% 46%;
  background: color-mix(in srgb, var(--blue) 13%, var(--surface));
  box-shadow: 0 5px 14px color-mix(in srgb, var(--blue) 12%, transparent);
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  font-size: .72em;
  font-weight: 400;
  line-height: 1;
  vertical-align: -.25em;
}
```

- [ ] **Step 3: Add accessible emoji spans to the first growth/AI slice**

Use decorative spans without replacing heading text:

```html
<h2><span class="storybook-heading-icon" aria-hidden="true">🌱</span>성장일기</h2>
<h2><span class="storybook-heading-icon" aria-hidden="true">📷</span>최근 사진</h2>
<h2 id="careTimerTitle"><span class="storybook-heading-icon" aria-hidden="true">⏱️</span>진행 중 기록</h2>
<h2 id="growthQuickTitle"><span class="storybook-heading-icon" aria-hidden="true">🍼</span>지금 바로 기록</h2>
<h2 id="carePatternTitle"><span class="storybook-heading-icon" aria-hidden="true">📊</span>돌봄 패턴</h2>
<h2 id="babyAiTitle"><span class="storybook-heading-icon" aria-hidden="true">✨</span>AI 육아 도우미</h2>
<h2 id="growthTitle"><span class="storybook-heading-icon" aria-hidden="true">💛</span>소중한 기록</h2>
```

- [ ] **Step 4: Run the focused contract and syntax check**

```bash
npx vitest run test/storybook-typography-emoji.test.js
node --check tab-emojis.js
git diff --check
```

Expected: 4 contract tests pass, JavaScript syntax exits 0, and no whitespace errors are reported.

- [ ] **Step 5: Commit the emoji slice**

```bash
git add index.html tab-emojis.js tab-emojis.css
git commit -m "style: enrich growth experience with semantic emoji"
```

---

### Task 4: Verify behavior and render the before/after result

**Files:**
- Modify only if QA finds a scoped defect: `typography-system.css`, `tab-emojis.css`, `index.html`

**Interfaces:**
- Consumes: completed typography and emoji slice
- Produces: passing repository checks and browser evidence at the approved viewports

- [ ] **Step 1: Run the complete repository verification**

```bash
npm test
npm run check
git diff --check
```

Expected: all tests pass, JavaScript/TypeScript checks exit 0, and no whitespace errors are reported.

- [ ] **Step 2: Verify font loading in the browser**

At `http://127.0.0.1:4173`, confirm through computed styles and the FontFaceSet that:

```text
Family Story Display: loaded
Family UI: loaded
Top-level and section headings: Family Story Display
AI body, buttons, inputs, dates, times and numbers: Family UI
```

- [ ] **Step 3: Inspect the approved responsive sizes**

Inspect the growth and AI screen at:

```text
390×844
430×932
768×1024
1440×900
```

Confirm no heading wrap regression, icon clipping, tab overflow, card overlap, or control-height regression. Check one representative bright theme for readable typography and emoji badge colors.

- [ ] **Step 4: Confirm accessibility contracts**

Confirm navigation tabs retain their Korean accessible names and every `.storybook-heading-icon` has `aria-hidden="true"`.

- [ ] **Step 5: Commit any QA-only corrections**

If QA changes were required:

```bash
git add typography-system.css tab-emojis.css index.html
git commit -m "fix: polish storybook typography responsiveness"
```

If no QA changes were required, do not create an empty commit.
