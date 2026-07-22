import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const profileSource = readFileSync("family-profile.js", "utf8");
const profileStyle = readFileSync("family-profile.css", "utf8");
const refreshSource = readFileSync("settings-refresh.js", "utf8");
const refreshStyle = readFileSync("settings-refresh.css", "utf8");

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

test("설정 화면을 열 때 새로고침 카드와 플로팅 버튼을 계속 복구한다", () => {
  expect(refreshSource).toContain('const ensureRefreshCard = () =>');
  expect(refreshSource).toContain('const ensureFloatingRefreshButton = () =>');
  expect(refreshSource).toContain("document.body?.classList.toggle('settings-refresh-active', active)");
  expect(refreshSource).toContain("button.hidden = false");
  expect(refreshSource).toContain("button.style.setProperty('display', 'grid', 'important')");
  expect(refreshStyle).toContain('body.settings-refresh-active > .refresh-button');
  expect(refreshStyle).toContain('display: grid !important;');
});

test("사진 및 새로고침 수정본을 새 캐시 버전으로 불러온다", () => {
  expect(config).toContain('{ name: "family-profile", version: "20260722-photo-upload-v3" }');
  expect(config).toContain('{ name: "settings-refresh", version: "20260722-persistent-v2" }');
  expect(config).not.toContain('family-profile-mascot');
});
