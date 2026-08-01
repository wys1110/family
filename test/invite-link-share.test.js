import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const invite = readFileSync("invite-link.js", "utf8");
const styles = readFileSync("invite-link.css", "utf8");
const serviceWorker = readFileSync("service-worker.js", "utf8");

describe("family invite sharing", () => {
  test("keeps the share action bound after account content is re-rendered", () => {
    expect(invite).toContain('document.addEventListener("click"');
    expect(invite).toContain('closest("#shareFamilyInvite")');
    expect(invite).not.toContain('querySelector("#shareFamilyInvite")?.addEventListener');
  });

  test("falls back from native sharing to verified clipboard copy", () => {
    expect(invite).toContain('typeof navigator.share === "function"');
    expect(invite).toContain('await copyInviteUrl(url)');
    expect(invite).toContain('Boolean(document.execCommand("copy"))');
    expect(invite).toContain("링크 복사됨");
  });

  test("shows an in-dialog manual link when sharing and copying are blocked", () => {
    expect(invite).toContain("revealManualInvite(button, url)");
    expect(invite).toContain("dataset.inviteManualLink");
    expect(styles).toContain(".invite-manual-link");
    expect(styles).toContain("user-select: all");
  });

  test("bypasses stale iOS caches for invite assets", () => {
    expect(serviceWorker).toContain('url.pathname.endsWith("/invite-link.js")');
    expect(serviceWorker).toContain('url.pathname.endsWith("/invite-link.css")');
  });
});
