import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("부모 생활 패턴의 시간 입력은 iPhone에서도 각 열 안에 유지된다", () => {
  const css = readFileSync("baby-ai-time-fields.css", "utf8");
  const config = readFileSync("config.js", "utf8");

  expect(config).toContain('{ name: "baby-ai-time-fields", version: "20260719-v1", script: false }');
  expect(css).toContain(".baby-ai-time-grid > label");
  expect(css).toContain("min-width: 0");
  expect(css).toContain('input[type="time"]::-webkit-date-and-time-value');
  expect(css).toContain("box-sizing: border-box !important");
  expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
});

test("아주 좁은 화면에서는 시간 입력을 한 열로 전환한다", () => {
  const css = readFileSync("baby-ai-time-fields.css", "utf8");

  expect(css).toMatch(/@media \(max-width: 350px\)[\s\S]*\.baby-ai-time-grid[\s\S]*grid-template-columns: 1fr/);
});
