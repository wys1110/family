import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';

test('public packaging includes demo mode and excludes standalone design previews and development files', () => {
  const root = mkdtempSync(join(tmpdir(), 'family-public-'));
  const files = ['index.html', 'demo-mode.js', 'app.js', 'config.js', 'styles.css', 'service-worker.js', 'manifest.webmanifest', 'assets/icons/chat.svg'];
  const excludedFiles = [
    '.env', '.local.js', 'queue.json', 'README.md', 'vitest.config.js', 'docs/report.html',
    'test/example.js', 'scripts/server.mjs', 'supabase/schema.sql', 'node_modules/example/index.js',
    'android/config.json', 'dist/stale.js',
    'design-preview.html', 'design-preview.js', 'design-preview.css', 'design-preview-palette.css',
  ];
  try {
    for (const file of [...files, ...excludedFiles]) {
      const path = join(root, file);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, `fixture: ${file}`);
    }
    writeFileSync(join(root, 'index.html'), '<script src="config.js"></script>');
    writeFileSync(join(root, 'scripts/prepare-capacitor.mjs'), readFileSync('scripts/prepare-capacitor.mjs'));
    execFileSync(process.execPath, [join(root, 'scripts/prepare-capacitor.mjs')]);
    const walk = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory() ? walk(join(dir, entry.name), `${prefix}${entry.name}/`) : `${prefix}${entry.name}`);
    expect(walk(join(root, 'dist')).sort()).toEqual(files.sort());
    for (const file of files.filter(file => file !== 'index.html')) {
      expect(readFileSync(join(root, 'dist', file), 'utf8')).toBe(`fixture: ${file}`);
    }
    const entry = () => readFileSync(join(root, 'dist/index.html'), 'utf8');
    const firstBuild = entry();
    expect(firstBuild).toMatch(/^<script src="config\.js\?v=[a-f0-9]{16}"><\/script>$/);
    writeFileSync(join(root, 'config.js'), 'updated manifest');
    execFileSync(process.execPath, [join(root, 'scripts/prepare-capacitor.mjs')]);
    expect(entry()).toMatch(/^<script src="config\.js\?v=[a-f0-9]{16}"><\/script>$/);
    expect(entry()).not.toBe(firstBuild);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
