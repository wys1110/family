import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
const repo = new URL('../', import.meta.url);
const sources = {
  baseline: execFileSync('git', ['show', '4addf04:travel-data.js'], { cwd: repo, encoding: 'utf8' }),
  current: fs.readFileSync(new URL('travel-data.js', repo), 'utf8'),
};
const fixture = JSON.stringify([{ id: 'trip', title: 'test', destinationLabel: 'test', startDate: '2026-01-01', endDate: '2026-12-31', items: Array.from({ length: 500 }, (_, i) => ({ id: `i${i}`, type: 'note', title: `n${i}`, dayIndex: i % 365, order: i, note: '' })) }]);
const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length/2)];
for (const [label, source] of Object.entries(sources)) {
  const samples = [];
  for (let run = 0; run < 5; run++) {
    const window = { FAMILY_APP_STATE: {}, addEventListener() {}, dispatchEvent() {} };
    const localStorage = { getItem: () => fixture, setItem() {} };
    const start = performance.now();
    vm.runInNewContext(source, { window, localStorage, crypto: globalThis.crypto, CustomEvent: class {} });
    const loaded = performance.now();
    await window.FAMILY_TRAVEL_DATA.updateItem('trip', 'i1', { title: 'changed' });
    const updated = performance.now();
    samples.push({ loadMs: loaded - start, updateMs: updated - loaded });
  }
  console.log(JSON.stringify({ label, runs: 5, medianLoadMs: median(samples.map(x => x.loadMs)), medianUpdateMs: median(samples.map(x => x.updateMs)), samples }));
}
