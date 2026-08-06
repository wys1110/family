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

  test('가이드는 현재 아기 프로필과 아기별 상태를 사용한다', () => {
    expect(source).toContain('activeBaby()');
    expect(source).toContain('familybabychange');
    expect(source).toContain('profiles');
    expect(source).toContain('data-guide-baby-name');
  });

  test('아기 출생일을 가이드 기준일로 우선 사용한다', () => {
    expect(source).toContain('profilePhaseInput(profile, baby)');
  });

  test('아기 프로필이 있으면 예정일 입력을 숨기고 출생일을 고정한다', () => {
    expect(source).toContain('data-guide-due-field');
    expect(source).toContain('dueField.hidden = Boolean(baby?.birthDate)');
    expect(source).toContain('if (baby?.birthDate) return render();');
    expect(source).toContain('아기 프로필이 있으면 생년월일을 자동으로 사용하고, 없으면 예정일을 입력해요.');
  });

  test('가이드 모듈을 등록하고 탭 라벨·설정 숨김을 연결한다', () => {
    expect(config).toContain('{ name: "family-guide-data", version: "20260806-family-guide-v4", style: false }');
    expect(config).toContain('{ name: "family-guide", version: "20260806-family-guide-v4" }');
    expect(tabEmojis).toContain("guide: ['🧭', '가이드']");
    expect(settings).toContain("'guideView'");
  });
});
