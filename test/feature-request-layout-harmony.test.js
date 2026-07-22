import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const config = readFileSync("config.js", "utf8");
const style = readFileSync("feature-request.css", "utf8");
const nightStyle = readFileSync("night-feature-request-polish.css", "utf8");

function declarationsFor(source, selector) {
  const rules = [...source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const rule = rules.find(([, selectors]) =>
    selectors.split(",").map((entry) => entry.trim()).includes(selector)
  );

  expect(rule, `missing CSS rule for ${selector}`).toBeTruthy();
  return rule[2];
}

function expectDeclarations(source, selector, declarations) {
  const body = declarationsFor(source, selector);

  for (const [property, value] of Object.entries(declarations)) {
    const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(body).toMatch(new RegExp(`${escapedProperty}\\s*:\\s*${escapedValue}\\s*;`));
  }
}

describe("request tab layout harmony", () => {
  test("centers the view and lets the app shell own bottom safe spacing", () => {
    expectDeclarations(style, "#featureRequestView.feature-request-view", {
      width: "100%",
      "max-width": "880px",
      "margin-inline": "auto",
      "padding-bottom": "0",
    });
  });

  test("keeps the request form stacked with a useful writing and action area", () => {
    expectDeclarations(style, "#featureRequestView .feature-request-form", { display: "block" });
    expectDeclarations(style, "#featureRequestView .feature-request-form textarea", {
      width: "100%",
      "min-height": "120px",
    });
    expectDeclarations(style, "#featureRequestView .feature-request-actions", {
      display: "flex",
      "justify-content": "space-between",
      "align-items": "center",
    });
    expectDeclarations(style, "#featureRequestView .feature-request-actions button", {
      "min-width": "112px",
      "min-height": "48px",
    });
  });

  test("gives status controls a stable two-column layout and touch targets", () => {
    expectDeclarations(style, "#featureRequestView .feature-request-item label", {
      display: "grid",
      "grid-template-columns": "auto minmax(0, 220px)",
      "white-space": "nowrap",
      "line-height": "1.4",
    });
    expectDeclarations(style, "#featureRequestView .feature-request-item select", {
      width: "100%",
      "max-width": "220px",
      "min-height": "44px",
      "margin-top": "0",
    });
    expectDeclarations(style, "#featureRequestView .feature-request-admin-heading button", {
      "min-height": "44px",
    });
    expectDeclarations(style, "#featureRequestView .feature-request-item p", {
      "max-width": "68ch",
    });
  });

  test("uses a textless decorative layer", () => {
    expectDeclarations(style, ".feature-request-card::after", {
      content: '\"\"',
      background: "radial-gradient(circle, rgba(86, 121, 106, .12), transparent 68%)",
    });
    expect(style).not.toContain('content: "?"');
    expect(style).not.toContain("font-family: Georgia");
  });

  test("harmonizes night outer cards and input surfaces", () => {
    const outerBackground = "radial-gradient(circle at 92% 0%, rgba(91, 136, 209, .12), transparent 42%), linear-gradient(155deg, rgba(14, 33, 56, .98), rgba(8, 23, 41, .98))";
    expectDeclarations(nightStyle, 'html[data-family-theme="night"] .feature-request-card', { background: outerBackground });
    expectDeclarations(nightStyle, 'html[data-family-theme="night"] .feature-request-admin', { background: outerBackground });
    expectDeclarations(nightStyle, 'html[data-family-theme="night"] .feature-request-form textarea', {
      background: "#182b42",
      "border-color": "rgba(157, 187, 232, .22)",
    });
  });

  test("updates both affected stylesheet cache versions", () => {
    expect(config).toContain('{ name: "feature-request", version: "20260722-korean-labels-v2" }');
    expect(config).toContain('{ name: "night-feature-request-polish", version: "20260722-layout-harmony-v1", script: false }');
  });
});
