import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baselinePath = resolve(root, "theme-color-baseline.json");
const writeBaseline = process.argv.includes("--write-baseline");
const extensions = new Set([".css", ".html", ".js", ".ts"]);
const ignoredDirectories = new Set([".git", ".github", "node_modules", "scripts", "supabase", "test"]);

// Raw palette values belong only in these files. The calendar exception is
// deliberately isolated; every other component must consume semantic tokens.
const paletteFiles = new Set([
  "theme-system.css",
  "theme-v2.css",
  "theme-calendar-exception.css",
]);

const literalPattern = /#[0-9a-f]{3,8}(?![0-9a-z_-])|(?:rgb|rgba|hsl|hsla)\([^)]*\)/gi;
const namedColorPattern = /(?<![-\w])(?:black|white|red|blue|green|gray|grey|orange|yellow|purple|pink|teal|navy|maroon|lime|aqua|fuchsia|silver|olive)(?![-\w])/gi;
const runtimeColorContext = /color|background|fill|stroke|shadow|border|outline|theme|palette|preview|gradient|style|meta/i;

function listSourceFiles(directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") return [];
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];

    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(absolute);
    if (!entry.isFile()) return [];

    const extension = entry.name.slice(entry.name.lastIndexOf("."));
    return extensions.has(extension) ? [absolute] : [];
  });
}

function stripComments(source, extension) {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  if (!new Set([".js", ".ts"]).has(extension)) return withoutBlocks;
  return withoutBlocks.replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function propertyAt(source, index) {
  const declarationStart = Math.max(
    source.lastIndexOf(";", index),
    source.lastIndexOf("{", index),
    source.lastIndexOf("}", index),
  );
  const prefix = source.slice(declarationStart + 1, index);
  return prefix.match(/([a-z-]+)\s*:/i)?.[1]?.toLowerCase() || null;
}

function normalizeLiteral(value) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function scanFile(absolute) {
  const file = relative(root, absolute).replaceAll("\\", "/");
  if (paletteFiles.has(file)) return [];

  const extension = absolute.slice(absolute.lastIndexOf("."));
  const source = stripComments(readFileSync(absolute, "utf8"), extension);
  const matches = [];

  for (const match of source.matchAll(literalPattern)) {
    const property = extension === ".css" ? propertyAt(source, match.index) : "runtime";
    if (extension === ".css" && !property) continue;
    if (extension !== ".css") {
      const context = source.slice(Math.max(0, match.index - 160), match.index + match[0].length + 160);
      if (!runtimeColorContext.test(context)) continue;
    }
    matches.push({
      file,
      line: lineNumberAt(source, match.index),
      fingerprint: `${property}:${normalizeLiteral(match[0])}`,
      literal: match[0],
    });
  }

  if (extension === ".css") {
    for (const match of source.matchAll(namedColorPattern)) {
      const property = propertyAt(source, match.index);
      if (!property) continue;
      matches.push({
        file,
        line: lineNumberAt(source, match.index),
        fingerprint: `${property}:${normalizeLiteral(match[0])}`,
        literal: match[0],
      });
    }
  }

  return matches;
}

function buildSnapshot(matches) {
  const files = {};
  for (const match of matches) {
    files[match.file] ||= {};
    files[match.file][match.fingerprint] = (files[match.file][match.fingerprint] || 0) + 1;
  }

  return {
    version: 1,
    policy: "No new direct color literals outside canonical theme palette files",
    paletteFiles: [...paletteFiles].sort(),
    files: Object.fromEntries(
      Object.entries(files)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([file, fingerprints]) => [
          file,
          Object.fromEntries(Object.entries(fingerprints).sort(([a], [b]) => a.localeCompare(b))),
        ]),
    ),
  };
}

const sourceFiles = listSourceFiles().filter((file) => statSync(file).isFile());
const matches = sourceFiles.flatMap(scanFile);
const current = buildSnapshot(matches);

if (writeBaseline) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Theme color baseline written: ${matches.length} existing literals tracked.`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error("Missing theme-color-baseline.json. Run the reviewed baseline generation command first.");
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const violations = [];

for (const match of matches) {
  const currentCount = current.files[match.file]?.[match.fingerprint] || 0;
  const allowedCount = baseline.files?.[match.file]?.[match.fingerprint] || 0;
  if (currentCount <= allowedCount) continue;
  if (violations.some((item) => item.file === match.file && item.fingerprint === match.fingerprint)) continue;
  violations.push({ ...match, currentCount, allowedCount });
}

if (violations.length) {
  console.error("Direct theme colors were added outside the approved palette files:");
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line} ${violation.literal} `
      + `(allowed ${violation.allowedCount}, found ${violation.currentCount})`,
    );
  }
  console.error("Use a semantic var(--theme-*) token, or define the palette value in a canonical theme file.");
  process.exit(1);
}

const remaining = Object.values(current.files)
  .flatMap((fingerprints) => Object.values(fingerprints))
  .reduce((sum, count) => sum + count, 0);
console.log(`Theme color guard passed. Existing migration debt: ${remaining} literals.`);
