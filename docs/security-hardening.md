# Family security hardening — review and release

Base: `daf8a9f6111bc41941e09596c3c4559bffe169a6`.
Prepared locally; production permissions, functions and GitHub Pages are not changed by this document.

## Behavior changes

- Removing a household member disables their push subscriptions. Every send, including scheduled/test sends, checks current membership and the push endpoint again.
- Only HTTPS browser-vendor push endpoints on the standard port are accepted. Credentials, fragments, arbitrary hosts and malformed encryption keys are rejected. Existing endpoints are validated again before delivery. Subscriptions cannot be transferred to another account through an upsert.
- An events/growth database trigger writes a minimal notification snapshot in a private schema, in the same transaction as the real change. The API atomically claims only the signed-in actor's recent committed changes; browser-supplied titles, dates and measurements are not trusted. Deletions use the saved snapshot. Concurrent duplicate requests cannot claim the same change twice.
- AI requests share persistent per-user (20/hour) and household (60/hour) budgets; scheduled generation uses the household budget too. Denied/unavailable budget checks do not call the model. Urgent static guidance does not consume model quota. Model HTTP calls time out after 30 seconds. Function JSON bodies are capped at 32 KiB even without a Content-Length header.
- Push API requests are limited to 60/minute per user; test sends to 5/minute. Subscription registration has an additional 10/minute limit and 20-device cap.
- App SECURITY DEFINER functions explicitly revoke anonymous execution while retaining authenticated execution and their existing authorization checks. No blanket grant is applied to unrelated database functions.
- The invite/member functions previously present only in production are versioned. New invite codes use 16 random bytes and expire in seven days. Invalid joins return null and persist attempt counts; the UI no longer reports success for a null result and accepts 32-character codes.
- Existing 32-character invite tokens are preserved. Legacy six-character tokens expire and can be regenerated through the owner invite action.
- Development dependencies are updated and pinned. Pages deployment now waits for validation of the same commit.

## Validation

- Existing application and new security regression tests run through `npm test`.
- New PGlite tests execute the actual two migrations against isolated Postgres fixtures: canonical/one-time change claims, cross-family/actor denial, deleted-row snapshots, transaction rollback, budgets, table ACLs, invite attempt persistence, endpoint ownership and membership-removal cleanup.
- PGlite fixtures emulate Supabase Auth and the pgcrypto random-byte helper; they do not connect to production. They do not prove production network egress behavior or browser push delivery.
- `npm run check` validates syntax, TypeScript and theme checks.
- `npm audit` covers npm development dependencies; it does not audit the remote Deno/CDN dependency graph.

## Ordered release (requires production approval)

1. Recheck current main and database function definitions for concurrent edits. The second migration captures existing production invite/member behavior; do not overwrite later production changes blindly.
2. Apply `20260912032052_family_security_hardening.sql`, then `20260912032358_family_invite_security_parity.sql` using the migration mechanism. These are transactional. Do not replay the historical migrations against an already initialized database.
3. Deploy `daily-briefing-push` and `baby-ai` with their referenced shared files, preserving the current secrets and explicit in-handler authentication. Do not deploy functions before the database RPCs exist; missing RPCs intentionally fail closed.
4. Publish the reviewed frontend/dependency/workflow commit. Confirm the validation job succeeds before Pages deploys.
5. Read back function ACLs, triggers, private table RLS and bucket policy settings; rerun Supabase security advisors. Validate HTTP authentication denial without sending real notifications. Any real test message or family membership change requires separate explicit authorization.

## Limits and recovery

- Notification delivery is best effort, at most once per claimed transaction. A crash after claiming can lose the alert; this patch does not provide a durable delivery retry worker. The original family record remains committed.
- Canonical change claims expire after ten minutes. Old internal snapshots are pruned by claim traffic after one day; no family source records are deleted.
- A push already handed to a vendor before membership revocation cannot be recalled. Membership checks prevent later sends once revocation is observed.
- Unsupported push providers fail closed. The allowlist covers Apple, FCM, Mozilla and Windows notify hosts, not arbitrary custom push providers.
- This change does not modify record pagination, cross-midnight sleep aggregation or backup scope from the earlier general review.
- If rollout fails, stop the deployment and investigate the failing step; do not drop family tables, clear storage or restore the old unrestricted ACLs. Keep the membership-revocation trigger and anonymous-execution revocations. A function rollback requires checking its compatibility with the new RPCs and leaves the previous security risks open.
