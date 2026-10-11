import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { expect, test } from 'vitest';

const script = fileURLToPath(new URL('../scripts/configure-kakao-map.mjs', import.meta.url));

async function fixture(config) {
  const root = await mkdtemp(join(tmpdir(), 'kakao-map-config-'));
  await mkdir(join(root, 'scripts'));
  await writeFile(join(root, 'scripts/configure-kakao-map.mjs'), await readFile(script));
  await writeFile(join(root, 'config.js'), config);
  return { root, configPath: join(root, 'config.js') };
}

test('requires a key and exactly one placeholder without changing config on failure', async () => {
  for (const [config, env] of [
    ['window.APP_CONFIG = { kakaoJavaScriptKey: "__KAKAO_JAVASCRIPT_KEY__" };', {}],
    ['window.APP_CONFIG = { a: "__KAKAO_JAVASCRIPT_KEY__", b: "__KAKAO_JAVASCRIPT_KEY__" };', { KAKAO_JAVASCRIPT_KEY: 'synthetic-key' }],
  ]) {
    const testRoot = await fixture(config);
    try {
      const result = spawnSync(process.execPath, [join(testRoot.root, 'scripts/configure-kakao-map.mjs')], { env, encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(await readFile(testRoot.configPath, 'utf8')).toBe(config);
    } finally {
      await rm(testRoot.root, { recursive: true, force: true });
    }
  }
});

test('writes a supplied key as a literal JavaScript string', async () => {
  const config = 'window.APP_CONFIG = { kakaoJavaScriptKey: "__KAKAO_JAVASCRIPT_KEY__" };';
  const key = `synthetic-\"key\\'); globalThis.injected = true; //`;
  const testRoot = await fixture(config);
  try {
    const result = spawnSync(process.execPath, [join(testRoot.root, 'scripts/configure-kakao-map.mjs')], { env: { KAKAO_JAVASCRIPT_KEY: key }, encoding: 'utf8' });
    expect(result.status).toBe(0);
    const context = { window: {} };
    vm.runInNewContext(await readFile(testRoot.configPath, 'utf8'), context);
    expect(context.window.APP_CONFIG.kakaoJavaScriptKey).toBe(key);
    expect(context.injected).toBeUndefined();
  } finally {
    await rm(testRoot.root, { recursive: true, force: true });
  }
});
