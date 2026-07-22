import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const source = readFileSync("family-profile.js", "utf8");

test("아이가 한 명이면 아이 제목을 한 번만 표시한다", () => {
  expect(source).toContain('<div class="family-profile-subheading"><strong>아이</strong>');
  expect(source).toContain("const fieldLabel = count === 1 ? '아이' : `아이 ${index + 1}`");
  expect(source).toContain("${count === 1 ? '' : `<span>${fieldLabel}</span>`}");
  expect(source).toContain('aria-label="${fieldLabel}"');
});

test("아이가 여러 명이면 각 입력창에 아이 번호를 표시한다", () => {
  expect(source).toContain("count === 1 ? '' : `<span>${fieldLabel}</span>`");
  expect(source).toContain('data-family-child-name="${index}"');
});

test("수정된 가족 이름 모듈을 새 캐시 버전으로 불러온다", () => {
  expect(config).toContain('{ name: "family-profile", version: "20260722-photo-upload-v3" }');
});
