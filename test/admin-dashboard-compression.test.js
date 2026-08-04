import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const modules = {
  global: readFileSync('family-admin.js', 'utf8'),
  resource: readFileSync('admin-resource-usage.js', 'utf8'),
  requests: readFileSync('platform-request-admin.js', 'utf8'),
  recent: readFileSync('admin-recent-activity.js', 'utf8'),
};
const styles = readFileSync('family-admin.css', 'utf8');

describe('compressed admin dashboard', () => {
  test('gives every admin card a shared collapse control and body', () => {
    Object.values(modules).forEach((moduleSource) => {
      expect(moduleSource).toContain('data-admin-collapse');
      expect(moduleSource).toContain('data-admin-card-body');
      expect(moduleSource).toContain('aria-expanded');
      expect(moduleSource).toContain('aria-controls');
    });
  });

  test('defaults detailed admin bodies to collapsed while keeping summaries visible', () => {
    Object.values(modules).forEach((moduleSource) => {
      expect(moduleSource).toMatch(/data-admin-collapsed="true"|dataset\.adminCollapsed = 'true'/);
    });
    expect(styles).toContain('[data-admin-collapsed="true"] [data-admin-card-body]');
  });

  test('uses one delegated toggle contract for keyboard and screen-reader state', () => {
    expect(modules.global).toContain("view.addEventListener('click'");
    expect(modules.global).toContain("button.setAttribute('aria-expanded', String(expanded))");
    expect(modules.global).toContain("button.textContent = expanded ? '접기' : '펼치기'");
  });

  test('closes another detail card before opening a new one', () => {
    expect(modules.global).toContain("view.querySelectorAll('.settings-card[data-admin-collapsed=\"false\"]')");
    expect(modules.global).toContain("otherButton.textContent = '펼치기'");
  });

  test('keeps compact card actions touch friendly on mobile', () => {
    expect(styles).toContain('.admin-card-actions');
    expect(styles).toContain('min-height: 44px');
    expect(styles).toContain('.admin-card-body[hidden]');
  });
});
