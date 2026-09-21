import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const excluded = new Set(['.git', 'android', 'dist', 'node_modules', 'docs', 'test', 'scripts']);
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
console.log(`Prepared Capacitor web assets in ${dist}`);
