import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('family-search.js', 'utf8');
const css = readFileSync('family-search.css', 'utf8');
const config = readFileSync('config.js', 'utf8');

describe('family search sheet', () => {
  test('검색 시트는 저장하지 않고 유형 필터와 결과 접근 이름을 제공한다', () => {
    expect(source).toContain("dialog.id = 'familySearchDialog'");
    expect(source).toContain('data-family-search-filter="all"');
    expect(source).toContain('data-family-search-result');
    expect(source).not.toContain('localStorage.setItem');
    expect(css).toContain('min-height: 44px');
  });

  test('검색 모듈은 버전 manifest와 기존 편집 어댑터를 사용한다', () => {
    expect(config).toContain('{ name: "family-search", version: "20260805-family-search-v1" }');
    expect(source).toContain('FAMILY_UTILITY_API');
    expect(source).toContain('FAMILY_TODO_API');
    expect(source).toContain('openEventDialog');
    expect(source).toContain('openGrowthDialog');
  });
});
