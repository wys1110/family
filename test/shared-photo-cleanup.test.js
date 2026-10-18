import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { expect, test, vi } from 'vitest';
function cleanupHarness(result = { data: [], error: null }) {
  const remove = vi.fn(async () => ({ error: null }));
  const read = vi.fn(async () => result);
  const query = { select: () => query, eq: () => query, contains: () => query, limit: read };
  const supabase = { from: () => query, storage: { from: () => ({ remove }) } };
  const window = {};
  vm.runInNewContext(readFileSync('family-data.js', 'utf8'), { window });
  return { remove, read, clean: options => window.FAMILY_DATA.removeUnreferencedGrowthPhotos({ supabase, householdId: 'home', paths: ['home/photo--preview.jpg'], ...options }) };
}
test('deleting or detaching a shared restored photo retains the remaining record file', async () => {
  const h = cleanupHarness({ data: [{ id: 'remaining-entry' }], error: null });
  await h.clean();
  expect(h.remove).not.toHaveBeenCalled();
});
test('only an unreferenced original and its paired thumbnail are removed', async () => {
  const h = cleanupHarness();
  await h.clean();
  expect(h.remove).toHaveBeenCalledWith(['home/photo--preview.jpg', 'home/photo--preview.jpg.thumb.jpg']);
});
test('reference lookup failure leaves files intact', async () => {
  const h = cleanupHarness({ data: null, error: new Error('offline') });
  await expect(h.clean()).rejects.toThrow('offline');
  expect(h.remove).not.toHaveBeenCalled();
});
test('account change during lookup cannot remove remote files', async () => {
  const h = cleanupHarness();
  let current = true;
  h.read.mockImplementation(async () => { current = false; return { data: [], error: null }; });
  await expect(h.clean({ isCurrent: () => current })).rejects.toThrow();
  expect(h.remove).not.toHaveBeenCalled();
});
test('restoring equal photo content for two entries gives separate stable retry paths', async () => {
  const window = {};
  vm.runInNewContext(readFileSync('family-backup-media.js', 'utf8'), { window, crypto: webcrypto, TextEncoder, Uint8Array, atob, btoa, Blob });
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const photo = { id: 'photo-0', mime: 'image/jpeg', sha256: hash, data: Buffer.from(bytes).toString('base64') };
  const payload = { backupId: 'bk-1111111111111111', photos: [photo], tables: { growth_entries: ['entry-a', 'entry-b'].map(id => ({ id, photo_refs: [{ id: photo.id, sha256: hash }] })) } };
  const files = new Map();
  const upload = vi.fn(async (path, content) => {
    if (files.has(path)) return { error: new Error('already exists') };
    files.set(path, content); return { error: null };
  });
  const download = vi.fn(async path => ({ data: new Blob([files.get(path)]), error: null }));
  const context = { householdId: 'home', supabase: { storage: { from: () => ({ upload, download }) } } };
  const restore = () => window.FAMILY_BACKUP_MEDIA.restore(payload, context, op => op(), () => {}, () => true);
  const first = await restore();
  const second = await restore();
  expect(first[0].photo_paths[0]).not.toBe(first[1].photo_paths[0]);
  expect(second.map(row => row.photo_paths)).toEqual(first.map(row => row.photo_paths));
  expect(upload).toHaveBeenCalledTimes(4);
  expect(download).toHaveBeenCalledTimes(2);
});
