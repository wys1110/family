import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const app = readFileSync("app.js", "utf8");

test("계정 화면은 알림 호칭을 엄마 또는 아빠로 저장한다", () => {
  expect(app).toContain("family_role");
  expect(app).toContain("엄마");
  expect(app).toContain("아빠");
  expect(app).toContain("auth.updateUser");
});
