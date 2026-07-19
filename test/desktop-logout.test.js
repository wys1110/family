import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("PC 헤더는 로그인 상태 전용 로그아웃 버튼을 제공한다", () => {
  const html = readFileSync("index.html", "utf8");
  const app = readFileSync("app.js", "utf8");
  const baseCss = readFileSync("styles.css", "utf8");
  const desktopCss = readFileSync("responsive-layout.css", "utf8");

  expect(html).toContain('id="desktopLogoutButton"');
  expect(app).toContain("function updateDesktopLogoutVisibility()");
  expect(app).toContain("async function signOutCurrentUser(button = null)");
  expect(app).toContain('$("#desktopLogoutButton").addEventListener("click"');
  expect(baseCss).toContain(".desktop-logout-button");
  expect(desktopCss).toContain(".desktop-logout-button:not([hidden])");
});

test("계정 팝업과 PC 버튼은 오류를 처리하는 공통 로그아웃 함수를 쓴다", () => {
  const app = readFileSync("app.js", "utf8");
  const invite = readFileSync("invite-link.js", "utf8");

  expect(app).toContain("const { error } = await state.supabase.auth.signOut()");
  expect(app).toContain('toast("로그아웃하지 못했어요. 다시 시도해 주세요")');
  expect(invite).toContain("signOutCurrentUser(event.currentTarget)");
  expect(invite).not.toContain("state.supabase.auth.signOut()");
});
