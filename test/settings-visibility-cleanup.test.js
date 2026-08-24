import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const settingsStyle = readFileSync("settings.css", "utf8");
const refreshSource = readFileSync("settings-refresh.js", "utf8");
const activitySource = readFileSync("activity-log.js", "utf8");
const dailyBriefingSource = readFileSync("daily-briefing.js", "utf8");
const feedingReminderSource = readFileSync("feeding-reminder.js", "utf8");

test("설정 화면에서 사용하지 않는 카드만 숨긴다", () => {
  expect(settingsStyle).toMatch(
    /#settingsView\s*>\s*\[data-settings-refresh-module\][\s\S]*?display:\s*none\s*!important;/,
  );
  expect(settingsStyle).toMatch(
    /#settingsView\s*>\s*\[data-activity-disclosure\][\s\S]*?display:\s*none\s*!important;/,
  );
  expect(settingsStyle).not.toContain("#eventChangePushSettings");
  expect(settingsStyle).toMatch(
    /#settingsView\s*>\s*#feedingReminderSettings[\s\S]*?display:\s*none\s*!important;/,
  );
  expect(settingsStyle).toContain("pointer-events: none !important;");
});

test("숨긴 설정 모듈은 유지하고 일정 변경 알림 카드는 노출한다", () => {
  expect(refreshSource).toContain("const ensureRefreshCard = () =>");
  expect(refreshSource).toContain("card.dataset.settingsRefreshModule = ''");
  expect(activitySource).toContain("notice.dataset.activityDisclosure = ''");
  expect(activitySource).toContain("settingsView.appendChild(notice)");
  expect(dailyBriefingSource).toContain('card.id = "eventChangePushSettings"');
  expect(dailyBriefingSource).toContain("settingsView.appendChild(card)");
  expect(feedingReminderSource).toContain('card.id = "feedingReminderSettings"');
  expect(feedingReminderSource).toContain("settingsView.appendChild(card)");
});
