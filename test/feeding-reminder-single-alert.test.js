import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const source = readFileSync("feeding-reminder.js", "utf8");
const config = readFileSync("config.js", "utf8");

test("여러 탭 중 하나만 같은 수유 주기의 알림을 선점한다", () => {
  expect(source).toContain("navigator.locks");
  expect(source).toContain("fallbackAlertClaim");
  expect(source).toContain("lastAlertReference === referenceKey");
  expect(source).toContain("family-feeding-alert:");
});

test("다른 탭의 알림 설정 변경을 즉시 동기화한다", () => {
  expect(source).toContain('window.addEventListener("storage"');
  expect(source).toContain("event.key !== scopedStorageKey()");
  expect(source).toContain("reminder = readSettings()");
});

test("화면과 시스템 알림을 동시에 중복 노출하지 않는다", () => {
  expect(source).toContain('document.visibilityState === "visible"');
  expect(source).toMatch(/if \(pageVisible[\s\S]*toast\(text\)[\s\S]*return;[\s\S]*new Notification/);
  expect(source).toContain("renotify: false");
});

test("닫은 배너는 같은 수유 주기 동안 다시 나타나지 않는다", () => {
  expect(source).toContain("dismissedBannerReference");
  expect(source).toContain("reminder.dismissedBannerReference === referenceKey");
});

test("새 알림 로직을 즉시 불러오도록 캐시 버전을 갱신한다", () => {
  expect(config).toContain('{ name: "feeding-reminder", version: "20260719-single-alert-v1" }');
});
