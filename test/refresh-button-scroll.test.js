import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("새로고침 전 현재 스크롤 위치를 저장하고 갱신 뒤 복원한다", () => {
  const source = readFileSync("refresh-button.js", "utf8");

  expect(source).toContain("const scrollTop = window.scrollY || document.documentElement.scrollTop || 0");
  expect(source).toContain("const scrollCheckpoint = createScrollCheckpoint()");
  expect(source).toMatch(/const loaded = await bootstrapData\(\)[\s\S]*finally \{[\s\S]*scrollCheckpoint\.restore\(\)/);
  expect(source).toContain("window.scrollTo(0, Math.min(scrollTop, maxScrollTop))");
  expect(source).toContain("window.requestAnimationFrame");
});

test("사용자가 갱신 중 직접 스크롤하면 자동 복원을 취소한다", () => {
  const source = readFileSync("refresh-button.js", "utf8");

  expect(source).toContain("window.addEventListener('touchstart', cancelRestore, passiveOptions)");
  expect(source).toContain("window.addEventListener('pointerdown', cancelRestore, passiveOptions)");
  expect(source).toContain("window.addEventListener('wheel', cancelRestore, passiveOptions)");
  expect(source).toContain("window.addEventListener('keydown', cancelRestore)");
});

test("변경된 새로고침 모듈을 즉시 불러오도록 캐시 버전을 갱신한다", () => {
  const config = readFileSync("config.js", "utf8");

  expect(config).toContain('{ name: "refresh-button", version: "20260719-preserve-scroll-v1" }');
});
