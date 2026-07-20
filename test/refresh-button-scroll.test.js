import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const source = readFileSync("refresh-button.js", "utf8");

test("새로고침 중 문서 높이를 유지하고 다음 페인트 전에 스크롤을 복원한다", () => {
  expect(source).toContain("const preservedHeight = Math.max(root.scrollHeight, pageBody.scrollHeight)");
  expect(source).toContain("pageBody.style.minHeight = `${preservedHeight}px`");
  expect(source).toContain("root.style.scrollBehavior = 'auto'");
  expect(source).toContain("const scrollCheckpoint = createScrollCheckpoint()");
  expect(source).toContain("const loaded = await refreshWithStableViewport(scrollCheckpoint)");
  expect(source).toContain("window.scrollTo(0, Math.min(scrollTop, maxScrollTop))");
  expect(source).toMatch(/releaseTemporaryStyles\(\);[\s\S]*apply\(\);[\s\S]*window\.requestAnimationFrame/);
});

test("지원 브라우저에서는 기존 화면을 유지한 채 갱신 결과로 즉시 교체한다", () => {
  expect(source).toContain("typeof document.startViewTransition !== 'function'");
  expect(source).toContain("const transition = document.startViewTransition(runRefresh)");
  expect(source).toContain("await transition.finished");
  expect(source).toContain("::view-transition-old(root)");
  expect(source).toContain("animation: none !important");
  expect(source).toMatch(/loaded = await bootstrapData\(\)[\s\S]*finally \{[\s\S]*scrollCheckpoint\.restore\(\)/);
});

test("사용자가 갱신 중 직접 스크롤하면 자동 복원을 취소한다", () => {
  expect(source).toContain("window.addEventListener('touchstart', cancelRestore, passiveOptions)");
  expect(source).toContain("window.addEventListener('pointerdown', cancelRestore, passiveOptions)");
  expect(source).toContain("window.addEventListener('wheel', cancelRestore, passiveOptions)");
  expect(source).toContain("window.addEventListener('keydown', cancelRestore)");
  expect(source).toMatch(/const cancelRestore = \(\) => \{[\s\S]*releaseTemporaryStyles\(\)/);
});

test("변경된 새로고침 모듈을 즉시 불러오도록 캐시 버전을 갱신한다", () => {
  const config = readFileSync("config.js", "utf8");

  expect(config).toContain('{ name: "refresh-button", version: "20260720-stable-viewport-v2" }');
});
