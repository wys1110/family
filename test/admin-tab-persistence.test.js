import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const moduleLoader = readFileSync("tab-emojis.js", "utf8");
const adminModule = readFileSync("family-admin.js", "utf8");

describe("admin tab persistence", () => {
  test("captures the persisted admin view before delayed admin modules load", () => {
    const captureIndex = moduleLoader.indexOf("localStorage.getItem('family-active-view-v1') === 'admin'");
    const adminLoadIndex = moduleLoader.indexOf("loadModule('family-admin'");

    expect(captureIndex).toBeGreaterThan(-1);
    expect(adminLoadIndex).toBeGreaterThan(captureIndex);
  });

  test("waits for verified admin access and restores the admin view", () => {
    expect(moduleLoader).toContain("const restorePersistedAdminView");
    expect(moduleLoader).toContain("adminTab && !adminTab.hidden");
    expect(moduleLoader).toContain("switchView.__familyAdminInstalled");
    expect(moduleLoader).toContain("switchView('admin')");
    expect(moduleLoader).toContain("restorePersistedAdminView();");
  });

  test("the admin module continues to persist admin as the active view", () => {
    expect(adminModule).toContain("localStorage.setItem(ACTIVE_VIEW_KEY, VIEW)");
  });
});
