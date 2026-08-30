import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("PC 헤더에 별도 로그아웃 버튼을 표시하지 않는다", () => {
  const html = readFileSync("index.html", "utf8");
  const baseCss = readFileSync("styles.css", "utf8");

  expect(html).toContain('id="desktopLogoutButton"');
  expect(baseCss).toContain(".desktop-logout-button { display:none; }");
});

test("계정 팝업 로그아웃은 오류를 처리하는 공통 함수를 쓴다", () => {
  const app = readFileSync("app.js", "utf8");
  const invite = readFileSync("invite-link.js", "utf8");

  expect(app).toContain("async function signOutCurrentUser(button = null)");
  expect(app).toContain("const { error } = await state.supabase.auth.signOut()");
  expect(app).toContain('toast("로그아웃하지 못했어요. 다시 시도해 주세요")');
  expect(app).toContain('id="logoutButton"');
  expect(invite).toContain("signOutCurrentUser(event.currentTarget)");
  expect(invite).not.toContain("state.supabase.auth.signOut()");
});

test("가족 공간이 없어도 계정 팝업에서 로그아웃할 수 있다", () => {
  const app = readFileSync("app.js", "utf8");
  const noHouseholdBranch = app.match(/if \(!state\.household\) \{([\s\S]*?)\n  \}\n  root\.innerHTML/)?.[1] || "";

  expect(noHouseholdBranch).toContain('id="logoutButton"');
  expect(noHouseholdBranch).toContain("signOutCurrentUser(event.currentTarget)");
});

test("초대 링크 계정 팝업도 가족 공간이 없어도 로그아웃할 수 있다", () => {
  const invite = readFileSync("invite-link.js", "utf8");
  const noHouseholdBranch = invite.match(/if \(!state\.household\) \{([\s\S]*?)\n      bindAccountActions\(root\);/)?.[1] || "";

  expect(noHouseholdBranch).toContain('id="logoutButton"');
});

test("가족 공간 조회에 실패하면 미가입 안내 팝업을 자동으로 열지 않는다", () => {
  const app = readFileSync("app.js", "utf8");

  expect(app).toContain("if (loaded && state.session && !state.household && !state.onboardingPrompted)");
});
