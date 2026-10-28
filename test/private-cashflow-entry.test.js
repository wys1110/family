import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const source = readFileSync('app.js', 'utf8');
const section = source.slice(source.indexOf('function privateCashflowEntry('), source.indexOf('\nfunction authRedirectUrl('));
const owner = readFileSync('family-admin.js', 'utf8').match(/const ADMIN_EMAIL = '([^']+)'/)[1];
function account(email, { demo = false, household = true } = {}) {
  const root = { innerHTML: '', querySelector: () => null };
  const context = {
    DEMO_MODE: demo, document: { querySelector: () => root }, pendingInvite: () => '', SHARE_BUTTON_HTML: '초대 링크 공유',
    state: { supabase: {}, session: email ? { user: { email } } : null, household: household ? { name: '합성 가족', invite_code: 'SYNTHETIC' } : null },
    $: selector => selector === '#accountContent' ? root : { addEventListener() {} },
    currentNotificationRole: () => '', escapeHtml: value => value,
    resetDemoMode() {}, exitDemoMode() {}, signInWithGoogle() {}, sendMagicLink() {},
    createHousehold() {}, joinHousehold() {}, saveNotificationRole() {}, signOutCurrentUser() {},
  };
  vm.createContext(context); vm.runInContext(section, context);
  const invite = readFileSync('invite-link.js', 'utf8');
  vm.runInContext(invite.slice(invite.indexOf('  const bindAccountActions ='), invite.indexOf('  const originalAuthRedirectUrl =')), context);
  context.renderAccount();
  return root.innerHTML;
}

test('owner shortcut survives production invite-account rendering, including before household setup', () => {
  for (const household of [true, false]) {
    expect(account(owner, { household })).toContain('내 자산 열기');
    expect(account('other@example.invalid', { household })).not.toContain('assets.html');
  }
  expect(account(null)).not.toContain('assets.html');
  expect(account(owner, { demo: true })).not.toContain('assets.html');
});

test('shortcut opens the same-site private dashboard without finance data or source document', () => {
  const html = account(owner);
  expect(html).toContain('href="assets.html"');
  expect(html).not.toContain('target="_blank"');
  expect(html).not.toMatch(/iframe|docs\.google\.com|금융자산 합계|세후 급여/);
  expect(account(owner.toUpperCase())).toContain('내 자산 열기');
});
