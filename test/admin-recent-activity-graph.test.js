import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const activityModule = readFileSync("admin-recent-activity.js", "utf8");
const moduleLoader = readFileSync("tab-emojis.js", "utf8");

describe("admin recent activity user graph", () => {
  test("renders a responsive per-user activity bar chart", () => {
    expect(activityModule).toContain("data-admin-user-chart-list");
    expect(activityModule).toContain("사용자별 활동");
    expect(activityModule).toContain("const buildUserActivityRows");
    expect(activityModule).toContain("const renderUserChart");
    expect(activityModule).toContain("--activity-width");
    expect(activityModule).toContain("MAX_CHART_USERS = 8");
  });

  test("groups records by user and sorts by activity count", () => {
    expect(activityModule).toContain("activity.user_id || activity.user_email");
    expect(activityModule).toContain("current.count += 1");
    expect(activityModule).toContain("b.count - a.count");
  });

  test("requests the RPC maximum so the chart and summary use the same dataset", () => {
    expect(activityModule).toContain("p_row_limit: 500");
  });

  test("busts the cached module after the graph release", () => {
    expect(moduleLoader).toContain("admin-recent-activity.js?v=20260804-dashboard-v1");
  });
});
