import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';

test('public packaging retains web assets and excludes server, database, test and local files', () => {
  const root = mkdtempSync(join(tmpdir(), 'family-public-'));
  const files = ['index.html', 'app.js', 'config.js', 'styles.css', 'service-worker.js', 'manifest.webmanifest', 'assets/icons/chat.svg'];
  const privateFiles = ['.env', '.local.js', 'queue.json', 'README.md', 'vitest.config.js', 'docs/report.html', 'test/example.js', 'scripts/server.mjs', 'supabase/schema.sql', 'node_modules/example/index.js', 'android/config.json', 'dist/stale.js'];
  try {
    for (const file of [...files, ...privateFiles]) {
      const path = join(root, file);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, `fixture: ${file}`);
    }
    writeFileSync(join(root, 'scripts/prepare-capacitor.mjs'), readFileSync('scripts/prepare-capacitor.mjs'));
    execFileSync(process.execPath, [join(root, 'scripts/prepare-capacitor.mjs')]);
    const walk = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory() ? walk(join(dir, entry.name), `${prefix}${entry.name}/`) : `${prefix}${entry.name}`);
    expect(walk(join(root, 'dist')).sort()).toEqual(files.sort());
    for (const file of files) expect(readFileSync(join(root, 'dist', file), 'utf8')).toBe(`fixture: ${file}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
