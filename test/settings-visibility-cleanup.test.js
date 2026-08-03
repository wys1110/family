import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const settingsStyle = readFileSync("settings.css", "utf8");
const refreshSource = readFileSync("settings-refresh.js", "utf8");
const activitySource = readFileSync("activity-log.js", "utf8");

test("설정 화면에서 중복 새로고침과 운영 기록 안내만 숨긴다", () => {
  expect(settingsStyle).toMatch(
    /#settingsView\s*>\s*\[data-settings-refresh-module\][\s\S]*?display:\s*none\s*!important;/,
  );
  expect(settingsStyle).toMatch(
    /#settingsView\s*>\s*\[data-activity-disclosure\][\s\S]*?display:\s*none\s*!important;/,
  );
  expect(settingsStyle).toContain("pointer-events: none !important;");
});

test("숨긴 설정 모듈의 생성 코드는 미래 재노출을 위해 유지한다", () => {
  expect(refreshSource).toContain("const ensureRefreshCard = () =>");
  expect(refreshSource).toContain("card.dataset.settingsRefreshModule = ''");
  expect(activitySource).toContain("notice.dataset.activityDisclosure = ''");
  expect(activitySource).toContain("settingsView.appendChild(notice)");
});
