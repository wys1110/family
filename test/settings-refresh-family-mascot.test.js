import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const refreshSource = readFileSync("settings-refresh.js", "utf8");
const refreshStyle = readFileSync("settings-refresh.css", "utf8");
const mascotSource = readFileSync("family-profile-mascot.js", "utf8");
const mascotStyle = readFileSync("family-profile-mascot.css", "utf8");

test("설정 화면에 전용 새로고침 카드와 동작을 제공한다", () => {
  expect(refreshSource).toContain("settingsRefreshTitle");
  expect(refreshSource).toContain("data-settings-refresh-action");
  expect(refreshSource).toContain("document.querySelector('[data-refresh-module]')");
  expect(refreshSource).toContain("button.hidden = false");
  expect(refreshStyle).toContain(".settings-refresh-action");
});

test("가족 이름 카드의 한자 아이콘을 귀여운 가족 마스코트로 교체한다", () => {
  expect(mascotSource).toContain("👨‍👩‍👦");
  expect(mascotSource).toContain("family-profile-mascot-heart");
  expect(mascotStyle).toContain("family-profile-mascot-bob");
  expect(mascotStyle).toContain("prefers-reduced-motion");
});

test("신규 모듈을 캐시 버전과 함께 로드한다", () => {
  expect(config).toContain('{ name: "family-profile-mascot", version: "20260722-cute-family-v1" }');
  expect(config).toContain('{ name: "settings-refresh", version: "20260722-settings-card-v1" }');
});
