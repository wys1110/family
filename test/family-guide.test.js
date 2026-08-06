import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('family-guide.js', 'utf8');
const style = readFileSync('family-guide.css', 'utf8');

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
  });
});
