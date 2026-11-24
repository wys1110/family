import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const excluded = new Set([
  '.git', 'android', 'dist', 'node_modules', 'docs', 'test', 'scripts', 'vitest.config.js',
  'design-preview.html', 'design-preview.js', 'design-preview.css', 'design-preview-palette.css',
]);
const publicExtensions = new Set(['.html', '.js', '.css', '.webmanifest', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.mp3', '.m4a', '.woff', '.woff2']);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const entry of await readdir(root)) {
  if (excluded.has(entry) || entry.startsWith('.')) continue;
  const source = join(root, entry);
  const info = await stat(source);
  if (info.isDirectory()) {
    if (entry === 'assets') await cp(source, join(dist, entry), { recursive: true });
    continue;
  }
  if (publicExtensions.has(extname(entry).toLowerCase())) await cp(source, join(dist, entry));
}
// Refresh navigations reload the HTML. Give each manifest its own browser cache key.
const configHash = createHash('sha256').update(await readFile(join(dist, 'config.js'))).digest('hex').slice(0, 16);
const indexPath = join(dist, 'index.html');
const html = await readFile(indexPath, 'utf8');
const entry = '<script src="config.js"></script>';
if (!html.includes(entry)) throw new Error('Missing config.js entry in index.html');
await writeFile(indexPath, html.replace(entry, `<script src="config.js?v=${configHash}"></script>`));
console.log(`Prepared Capacitor web assets in ${dist}`);
