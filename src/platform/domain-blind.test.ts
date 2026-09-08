/**
 * Platform is domain-blind (#1489): nothing under `src/platform` may
 * value-import a product domain. The `no-restricted-imports` overrides in
 * `.oxlintrc.json` say the same thing per file, but they match the `@/`
 * alias only — a relative `../../shots/…` walks straight past them. This test
 * resolves every value import instead, and pins the composition-root list
 * (the few files whose job is to wire every domain together) to the one the
 * lint config carries, so neither can silently outgrow the other.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');
const DOMAINS = [
  'sequences',
  'shots',
  'motion',
  'stills',
  'audio',
  'cast',
  'look',
  'billing',
  'studio',
  'models',
];

/** Files the lint config exempts, read from the override that names them. */
function compositionRootsFromLint(): string[] {
  const text = readFileSync(join(ROOT, '.oxlintrc.json'), 'utf8');
  const block = text.slice(text.indexOf('// Composition roots:'));
  const files = block.slice(block.indexOf('"files"'), block.indexOf('"rules"'));
  return [...files.matchAll(/"([^"]+)"/g)]
    .map((m) => m[1] ?? '')
    .filter((s) => s !== 'files');
}
const extra = [
  // Also exempt in the db-access overrides further down the lint config.
  'src/platform/server/workflow/base-workflow.ts',
];

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(p) && !/\.(test|spec|stories)\./.test(p)) yield p;
  }
}

const IMPORT_RE =
  /^(?:import|export)\s+(?!type\s)[\s\S]*?\s+from\s+['"]([^'"]+)['"]/gm;

function domainOf(from: string, spec: string): string | null {
  const target = spec.startsWith('.')
    ? relative(ROOT, resolve(from, '..', spec))
    : spec.startsWith('@/')
      ? spec.replace(/^@\//, 'src/')
      : null;
  if (!target) return null;
  const top = target.split('/')[1];
  return top && DOMAINS.includes(top) ? top : null;
}

describe('src/platform is domain-blind', () => {
  const roots = compositionRootsFromLint();
  const isExempt = (rel: string) =>
    [...roots, ...extra].some((r) =>
      r.endsWith('/**') ? rel.startsWith(r.slice(0, -3) + '/') : rel === r
    );

  it('names its composition roots in .oxlintrc.json', () => {
    expect(roots.length).toBeGreaterThan(0);
    expect(roots.length).toBeLessThan(10);
  });

  it('value-imports no domain module outside those roots', () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, 'src', 'platform'))) {
      const rel = relative(ROOT, file);
      if (isExempt(rel)) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
        const domain = domainOf(file, m[1] ?? '');
        if (domain) offenders.push(`${rel} → ${m[1]} (${domain})`);
      }
    }
    expect(
      offenders,
      offenders.length
        ? `platform files value-importing a domain (move the file to that domain, or make the import type-only):\n  ${offenders.join('\n  ')}`
        : undefined
    ).toEqual([]);
  });
});
