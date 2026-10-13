import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync('app.js', 'utf8');
function harness(albumOpen = false) {
  const nodes = new Map();
  const $ = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', hidden: false, textContent: '', classList: { contains: () => albumOpen }, querySelectorAll: () => [], replaceChildren: vi.fn(), addEventListener: vi.fn() });
    return nodes.get(selector);
  };
  const context = { $, activeBaby: () => ({ name: '아기' }), escapeHtml: String, openGrowthDialog: vi.fn(), openRecentPhoto: vi.fn(), renderPhotoAlbum: vi.fn(), allPhotoItems: [], recentPhotoItems: [] };
  vm.createContext(context);
  for (const [name, end] of [['renderGrowthInsights', 'renderRecentPhotos'], ['renderRecentPhotos', 'renderPhotoAlbum']]) {
    const start = source.indexOf(`function ${name}(`);
    vm.runInContext(source.slice(start, source.indexOf(`function ${end}(`, start)), context);
  }
  vm.runInContext('this.sortItems = 0; const originalSort = Array.prototype.sort; Array.prototype.sort = function(...args) { sortItems += this.length; return originalSort.apply(this, args); };', context);
  return { context, $ };
}

test('latest measurement keeps missing-time ordering and the first record at equal timestamps without sorting history', () => {
  const { context, $ } = harness();
  const entries = [{ date: '2026-10-13', time: '', weight: 5 }, { date: '2026-10-13', time: '00:00', weight: 6 }, { date: '2026-10-12', time: '23:59', height: 70 }, { date: '2026-10-14', weight: 0, height: null, head: '' }];
  const original = structuredClone(entries);
  // Realm-local input means a sort of the filtered history is observable.
  context.entries = JSON.stringify(entries);
  vm.runInContext('this.parsedEntries = JSON.parse(entries); renderGrowthInsights(parsedEntries);', context);
  expect($('#growthInsightRow').innerHTML).toContain('5<small>kg');
  expect($('#growthInsightRow').innerHTML).not.toContain('6<small>kg');
  expect(context.sortItems).toBe(0);
  expect(JSON.parse(JSON.stringify(context.parsedEntries))).toEqual(original);
  context.renderGrowthInsights([{ date: '2026-10-13', time: '00:01', weight: 7 }, ...entries]);
  expect($('#growthInsightRow').innerHTML).toContain('7<small>kg');
});

test('empty measurement values retain the empty action', () => {
  const { context, $ } = harness();
  context.renderGrowthInsights([{ date: '2026-10-13', weight: 0, height: '', head: null }]);
  expect($('#growthInsightRow').innerHTML).toContain('첫 성장 측정을 남겨보세요');
  expect($('#growthInsightRow [data-growth-quick]').addEventListener).toHaveBeenCalledTimes(1);
});

test('photo-free history does not enter sorting and clears the visible grids', () => {
  const { context, $ } = harness();
  context.entries = JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ date: '2026-10-13', photoUrls: i % 2 ? ['', null] : undefined })));
  vm.runInContext('renderRecentPhotos(JSON.parse(entries));', context);
  expect(context.sortItems).toBe(0);
  expect(context.allPhotoItems).toHaveLength(0);
  expect($('#recentPhotoSection').hidden).toBe(true);
  expect($('#recentPhotoGrid').replaceChildren).toHaveBeenCalledTimes(1);
});

test('photos preserve stable entry order, original URL indexes, four-photo preview and complete album data', () => {
  const { context, $ } = harness(true);
  const entries = [{ id: 'first', title: '첫', date: '2026-10-13', time: '', photoUrls: ['', 'a', 'b'], photoThumbnailUrls: ['wrong', 'thumb-a', ''] }, { id: 'second', title: '둘', date: '2026-10-13', time: '23:59', photoUrls: ['c'] }, { id: 'older', title: '전', date: '2026-10-12', photoUrls: ['d', 'e', 'f'] }, { id: 'empty', date: '2026-10-14', photoUrls: ['', null] }];
  const before = structuredClone(entries);
  const expected = [...entries].sort((a, b) => `${b.date}T${b.time || '23:59'}`.localeCompare(`${a.date}T${a.time || '23:59'}`)).flatMap(entry => (entry.photoUrls || []).map((url, index) => ({ url, thumbnailUrl: entry.photoThumbnailUrls?.[index] || url, entry, filePromise: null }))).filter(item => item.url);
  context.renderRecentPhotos(entries);
  expect(context.allPhotoItems).toEqual(expected);
  expect(context.recentPhotoItems.map(item => item.url)).toEqual(['a', 'b', 'c', 'd']);
  expect($('#recentPhotoGrid').innerHTML).toContain('src="thumb-a" data-original-src="a"');
  expect($('#recentPhotoCount').textContent).toBe('최신 4장');
  expect(context.renderPhotoAlbum).toHaveBeenCalledTimes(1);
  expect(entries).toEqual(before);
});


test('photo preview retains complete history beyond the sixty-photo album page', () => {
  const { context } = harness(true);
  const entries = Array.from({ length: 75 }, (_, i) => ({ id: String(i), title: '사진', date: '2026-10-13', photoUrls: [`url-${i}`] }));
  context.renderRecentPhotos(entries);
  expect(context.recentPhotoItems).toHaveLength(4);
  expect(context.allPhotoItems).toHaveLength(75);
  expect(context.allPhotoItems.at(-1).url).toBe('url-74');
  expect(context.renderPhotoAlbum).toHaveBeenCalledTimes(1);
});
