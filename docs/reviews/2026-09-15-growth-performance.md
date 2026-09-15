# Growth reliability and performance verification

Baseline: 84e741388306078bd6863effd950e957dda9c58d.

Changes:
- Render the growth list in increments of 100, retaining the complete dataset.
- Render one selected measurement series, up to its latest 90 measurements; retain complete measurement history.
- Reuse signed photo URLs within the same household/user for 45 minutes; request missing URLs in batches of 100. Avoid a forced duplicate startup refresh.
- Delete confirmed rows locally without reloading a potentially server-capped list. Reject stale household responses and separate photo cleanup errors from database deletion success.
- Restore growth edit/delete scroll position after the graph's deferred rendering finishes.
- Split overnight sleep for daily/weekly/report display while retaining the original record ID for editing.

## Browser verification

Local demo mode, headless Chromium 153, 390 × 844 viewport. Synthetic data only; no production records changed. Compared baseline assets and changed assets on the same local HTTP server. Each timing includes renderGrowth and two animation frames. Seven samples per version, after warmup, with 2,000 measurement records.

| Version | Median render time | Initial list rows |
| --- | ---: | ---: |
| Baseline | 1,572.5 ms | 2,000 |
| Updated | 53.0 ms | 100 |

This measures local rendering with a deliberately large dataset, not iPhone or production network performance. A subsequent workflow run measured 51.4 ms.

- More records increases rendered list from 100 to 200.
- Height selection sets aria-pressed=true and updates the graph.
- Document width equals viewport width at 320, 390, 430, and 768 px.
- Edit changes the record title and preserves scrollY=2933; delete removes only the selected row and preserves scrollY=2933.
- Sleep starting 2026-09-13 23:00 for 120 minutes appears on September 14 at 00:00 as 1 hour. Editing that card opens the original September 13 / 120-minute record.
- No page JavaScript errors in the rendering comparison.

## Automated verification

435 tests across 85 files passed. npm run check passed, including syntax, TypeScript, and the existing theme guard. New behavioral tests cover midnight segmentation, deletion beyond 1,000 rows, old household responses, delete failures, post-delete photo cleanup failure, signed URL batching/cache invalidation, and partial photo refresh failures.
