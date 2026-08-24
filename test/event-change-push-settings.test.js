import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("daily-briefing.js", "utf8");
const eventPush = readFileSync("event-change-push.js", "utf8");
const settingsCss = readFileSync("settings.css", "utf8");
const edge = readFileSync("supabase/functions/daily-briefing-push/index.ts", "utf8");

describe("family event push settings", () => {
  it("shows one compact device toggle", () => {
    expect(client).toContain('card.id = "eventChangePushSettings"');
    expect(client).toContain('id="eventChangePushToggle"');
    expect(client).toContain("가족 일정 변경 알림");
    expect(client).not.toContain('id="dailyBriefingTime"');
    expect(client).not.toContain("아침 일정 브리핑");
  });

  it("never enables briefing delivery", () => {
    expect(client).toContain("pushEnabled: true");
    expect(client).toContain("pushEnabled: false");
    expect(client).toMatch(/briefingEnabled:\s*false/);
  });

  it("does not hide the event push card or patch its copy later", () => {
    expect(settingsCss).not.toContain("#eventChangePushSettings");
    expect(eventPush).not.toContain("updateSettingsCopy");
  });

  it("blocks real permission prompts in demo mode", () => {
    expect(client).toContain("window.FAMILY_DEMO_MODE === true");
    expect(client).toMatch(/FAMILY_DEMO_MODE[\s\S]*?Notification\.requestPermission\(\)/);
    expect(client).toContain("!state.supabase");
  });

  it("reconciles the current device state with the authenticated server record", () => {
    expect(client).toContain('action: "subscription-status"');
    expect(client).toContain("reconcileSubscriptionState");
    expect(edge).toContain('if (body.action === "subscription-status")');
    expect(edge).toContain('.eq("user_id", user.id)');
    expect(edge).toContain('.eq("household_id", householdId)');
    expect(edge).toContain('.eq("endpoint", endpoint)');
  });
});
