import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const adminStyles = readFileSync("family-admin.css", "utf8");
const recentActivityStyles = readFileSync("admin-recent-activity.js", "utf8");
const platformRequestStyles = readFileSync("platform-request-admin.js", "utf8");

describe("admin mobile layout alignment", () => {
  test("keeps primary admin blocks on the same full-width grid", () => {
    expect(adminStyles).toContain(".admin-view .global-admin-stats,");
    expect(adminStyles).toContain(".admin-view .global-admin-search,");
    expect(adminStyles).toContain(".admin-view .global-admin-modes,");
    expect(adminStyles).toContain(".admin-view .global-admin-list,");
    expect(adminStyles).toContain("width: 100%;\n  min-width: 0;\n  max-width: 100%;\n  box-sizing: border-box;");
  });

  test("removes inherited form spacing and inner input chrome from search", () => {
    expect(adminStyles).toContain(".global-admin-search { margin: 0; }");
    expect(adminStyles).toContain("margin: 0;\n  padding: 0 4px;");
    expect(adminStyles).toContain("border-radius: 0;\n  background: transparent;\n  box-shadow: none;");
    expect(adminStyles).toContain(".global-admin-search input:focus { box-shadow: none; }");
  });

  test("stretches the mobile refresh button to the shared outer edges", () => {
    expect(adminStyles).toContain("justify-self: stretch; width: 100%; max-width: 100%; box-sizing: border-box;");
    expect(adminStyles).toContain(".global-admin-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }");
  });

  test("uses semantic theme tokens for avatars and shared admin cards", () => {
    expect(adminStyles).toContain(".global-admin-avatar { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; color: var(--label); background: linear-gradient(145deg, var(--surface), var(--surface-2));");
    expect(adminStyles).not.toContain(".global-admin-avatar { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; color: #fff;");
    expect(adminStyles).toContain(".admin-view > .settings-card");
  });

  test("keeps admin controls at a touch-friendly height", () => {
    expect(adminStyles).toContain("min-height: 44px; padding: 0 12px;");
    expect(adminStyles).toContain(".global-admin-modes button { min-height: 44px;");
    expect(recentActivityStyles).toContain(".admin-recent-controls input, .admin-recent-controls select { width: 100%; min-height: 44px;");
  });

  test("stretches dynamically injected admin refresh buttons on mobile", () => {
    const mobileRefreshContract = "grid-column: 1 / -1; justify-self: stretch; width: 100%; max-width: 100%; box-sizing: border-box;";
    expect(recentActivityStyles).toContain(mobileRefreshContract);
    expect(platformRequestStyles).toContain(mobileRefreshContract);
  });
});
