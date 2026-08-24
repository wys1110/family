import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(path, "utf8");

describe("feature request settings navigation", () => {
  const featureRequest = read("feature-request.js");
  const tabEmojis = read("tab-emojis.js");

  it("does not create a top-level request tab", () => {
    expect(featureRequest).not.toContain("navigation.appendChild(tab)");
    expect(tabEmojis).not.toContain("'feature-request':");
  });

  it("installs a settings entry and a return action", () => {
    expect(featureRequest).toContain("data-feature-request-settings-entry");
    expect(featureRequest).toContain("data-open-feature-request");
    expect(featureRequest).toContain("data-close-feature-request");
    expect(featureRequest).toContain("window.switchView('settings')");
  });

  it("keeps Settings selected and normalizes the obsolete saved view", () => {
    expect(featureRequest).toContain("tab.dataset.view === 'settings'");
    expect(featureRequest).toContain("localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, 'settings')");
    expect(featureRequest).toContain("savedView === VIEW_NAME");
  });
});
