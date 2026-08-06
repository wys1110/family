import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('family-guide.js', 'utf8');
const style = readFileSync('family-guide.css', 'utf8');
const config = readFileSync('config.js', 'utf8');
const tabEmojis = readFileSync('tab-emojis.js', 'utf8');
const settings = readFileSync('settings.js', 'utf8');

describe('family guide tab', () => {
  test('가이드 탭은 전용 설정 키와 출처 UI를 사용한다', () => {
    expect(source).toContain('family-guide-settings-v1');
    expect(source).toContain("tab.dataset.view = VIEW_NAME");
    expect(source).toContain('sourceUrl');
    expect(source).toContain('target="_blank"');
    expect(source).toContain('noopener noreferrer');
    expect(style).toContain('#guideView');
  });

  test('숨김·완료 상태는 별도 배열로 저장한다', () => {
    expect(source).toContain('hiddenCardIds');
    expect(source).toContain('completedCardIds');
    expect(source).toContain('FAMILY_GUIDE_API');
    expect(source).toContain('data-guide-restore-hidden');
  });

  test('가이드 모듈을 등록하고 탭 라벨·설정 숨김을 연결한다', () => {
    expect(config).toContain('{ name: "family-guide-data", version: "20260806-family-guide-v1", style: false }');
    expect(config).toContain('{ name: "family-guide", version: "20260806-family-guide-v1" }');
    expect(tabEmojis).toContain("guide: ['🧭', '가이드']");
    expect(settings).toContain("'guideView'");
  });
});
