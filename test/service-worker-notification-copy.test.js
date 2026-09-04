import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const worker = readFileSync("service-worker.js", "utf8");

test("빈 알림 본문은 일정 안내 문구로 대체하지 않는다", () => {
  expect(worker).toContain('const notificationBody = typeof payload.body === "string" ? payload.body : "오늘 일정을 확인해 주세요.";');
  expect(worker).toContain("body: notificationBody,");
  expect(worker).not.toContain('body: payload.body || "오늘 일정을 확인해 주세요."');
});
