import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const profileSource = readFileSync("family-profile.js", "utf8");
const profileStyle = readFileSync("family-profile.css", "utf8");
const refreshSource = readFileSync("settings-refresh.js", "utf8");
const refreshStyle = readFileSync("settings-refresh.css", "utf8");
const feedingStyle = readFileSync("feeding-reminder.css", "utf8");
const serviceWorker = readFileSync("service-worker.js", "utf8");

test("가족 이름 카드에서 이모지 대신 사진을 선택하고 저장할 수 있다", () => {
  expect(profileSource).toContain('data-family-photo-input');
  expect(profileSource).toContain('accept="image/jpeg,image/png,image/webp,image/heic,image/heif"');
  expect(profileSource).toContain('const compressSquarePhoto = async (file) =>');
  expect(profileSource).toContain('photoDataUrl: normalizePhoto(stored.photoDataUrl)');
  expect(profileSource).toContain("savePhoto(photoDataUrl)");
  expect(profileStyle).toContain('.family-profile-photo-button img');
  expect(profileStyle).toContain('.family-profile-photo-placeholder::before');
  expect(profileSource).not.toContain('👨‍👩‍👦');
});

test("설정 전용 새로고침 카드는 유지하고 플로팅 버튼은 폼 위에서 숨긴다", () => {
  expect(refreshSource).toContain('const ensureRefreshCard = () =>');
  expect(refreshSource).toContain('const ensureFloatingRefreshButton = () =>');
  expect(refreshSource).toContain('const releaseFloatingRefreshOverride = () =>');
  expect(refreshSource).toContain("document.body?.classList.toggle('settings-refresh-active', active)");
  expect(refreshSource).toContain("button.style.removeProperty('display')");
  expect(refreshSource).not.toContain("button.style.setProperty('display', 'grid', 'important')");
  expect(refreshStyle).toContain('body.settings-refresh-active > .refresh-button');
  expect(refreshStyle).toContain('display: none !important;');
  expect(refreshStyle).toContain('pointer-events: none !important;');
});

test("수유 알림 헤더는 좁은 화면에서도 음수 여백 없이 세 열로 정렬한다", () => {
  const legacyIndex = feedingStyle.indexOf('.feeding-reminder-switch{grid-column:1/-1;justify-self:end;margin-top:-38px}');
  const stableIndex = feedingStyle.indexOf('#settingsView #feedingReminderSettings .feeding-reminder-switch');

  expect(legacyIndex).toBeGreaterThan(-1);
  expect(stableIndex).toBeGreaterThan(legacyIndex);
  expect(feedingStyle).toContain('#settingsView #feedingReminderSettings .settings-heading');
  expect(feedingStyle).toContain('grid-template-columns: 44px minmax(0, 1fr) 46px;');
  expect(feedingStyle).toContain('grid-column: 3;');
  expect(feedingStyle).toContain('margin: 7px 0 0;');
});

test("아이폰 설치 앱도 수정된 설정 자산을 네트워크에서 다시 받는다", () => {
  expect(serviceWorker).toContain('url.pathname.endsWith("/settings-refresh.css")');
  expect(serviceWorker).toContain('url.pathname.endsWith("/settings-refresh.js")');
  expect(serviceWorker).toContain('url.pathname.endsWith("/feeding-reminder.css")');
});

test("사진 및 새로고침 모듈을 기존 캐시 키로 계속 불러온다", () => {
  expect(config).toContain('{ name: "family-profile", version: "20260722-photo-upload-v3" }');
  expect(config).toContain('{ name: "settings-refresh", version: "20260722-persistent-v2" }');
  expect(config).not.toContain('family-profile-mascot');
});
