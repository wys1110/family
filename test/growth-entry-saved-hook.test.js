import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("new growth records continue to refresh reminders and notifications", () => {
  const app = readFileSync("app.js", "utf8");
  const reminder = readFileSync("feeding-reminder.js", "utf8");
  const notifications = readFileSync("notification-center.js", "utf8");

  expect(app).toContain("function dispatchGrowthEntrySaved(entry)");
  expect(app.match(/dispatchGrowthEntrySaved\(entry\)/g)?.length).toBeGreaterThanOrEqual(4);
  expect(reminder).toContain('addEventListener("family:growth-entry-saved"');
  expect(notifications).toContain("addEventListener('family:growth-entry-saved'");
});
