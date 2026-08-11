import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('가이드 탭과 로더 참조를 제거한다', () => {
  expect(read('config.js')).not.toContain('family-guide');
  expect(read('tab-emojis.js')).not.toContain("guide: ['🧭', '가이드']");
  expect(read('settings.js')).not.toContain("'guideView'");
});
