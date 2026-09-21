import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const read = path => readFileSync(path, 'utf8');

test('Capacitor Android packaging keeps the app identity and generated assets isolated', () => {
  const config = read('capacitor.config.ts');
  const packageJson = JSON.parse(read('package.json'));
  const gitignore = read('.gitignore');
  const preparer = read('scripts/prepare-capacitor.mjs');

  expect(config).toContain("appId: 'com.wys1110.family'");
  expect(config).toContain("appName: '우리 가족'");
  expect(config).toContain("webDir: 'dist'");
  expect(packageJson.scripts['android:sync']).toContain('android:prepare');
  expect(packageJson.scripts['android:debug']).toContain('assembleDebug');
  expect(packageJson.scripts['android:bundle']).toContain('bundleRelease');
  expect(gitignore).toMatch(/^dist\/$/m);
  expect(preparer).toContain("entry === 'assets'");
  expect(preparer).toContain("entry.startsWith('.')");
});

test('native bridge is loaded by the app shell and only intercepts external links on native Android', () => {
  const html = read('index.html');
  const bridge = read('native-bridge.js');

  expect(html).toContain('<script src="native-bridge.js?v=20260921-android-v1"></script>');
  expect(bridge).toContain("capacitor?.isNativePlatform?.()");
  expect(bridge).toContain("/^https?:$/i");
  expect(bridge).toContain("app.exitApp?.()");
});
