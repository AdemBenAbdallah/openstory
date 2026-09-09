/**
 * Render drizzle-kit's nested migrations into the flat layout wrangler needs.
 *
 * drizzle-kit emits `drizzle/migrations/<timestamp>_<name>/migration.sql`,
 * but `wrangler d1 migrations apply` only reads flat `*.sql` files in
 * `migrations_dir` — against the nested layout it silently finds zero files
 * (see scripts/migrate-local-d1.ts). This script writes each migration to
 * `drizzle/migrations-wrangler/<timestamp>_<name>.sql` (gitignored, rebuilt
 * from scratch on every run), so the nested directory stays the single
 * source of truth.
 *
 * Ordering: wrangler sorts unapplied migrations by NUMERIC filename prefix
 * (parseInt of the segment before the first underscore), and records applied
 * ones by full filename in `d1_migrations`. drizzle's fixed-width 14-digit
 * timestamps make numeric and lexicographic order coincide — keep that
 * prefix shape for any hand-named migration (a non-numeric prefix sorts as
 * NaN). src/platform/server/db/migrations-layout.test.ts pins this.
 *
 * Run by the `deploy` and `db:migrate:prd` package scripts, and directly by
 * the PR-preview migrate step in .github/workflows/deploy-cloudflare.yml.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(import.meta.dirname, '..');
const SOURCE_DIR = join(REPO_ROOT, 'drizzle/migrations');
const TARGET_DIR = join(REPO_ROOT, 'drizzle/migrations-wrangler');

const migrationDirs = readdirSync(SOURCE_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'meta')
  .map((entry) => entry.name)
  .sort();

// Zero migrations means the layout changed (drizzle-kit has reshuffled its
// emit format across majors) or the checkout is broken. Exiting 0 here would
// let `wrangler d1 migrations apply` report "no migrations to apply" and the
// deploy go green against an unmigrated database — the exact failure this
// script exists to prevent.
if (migrationDirs.length === 0) {
  throw new Error(
    `[flatten-migrations] no migration folders found in ${SOURCE_DIR} — did drizzle-kit's output layout change?`
  );
}

const missing = migrationDirs.filter(
  (dir) => !existsSync(join(SOURCE_DIR, dir, 'migration.sql'))
);
if (missing.length > 0) {
  throw new Error(
    `[flatten-migrations] migration folders without migration.sql: ${missing.join(', ')}`
  );
}

rmSync(TARGET_DIR, { recursive: true, force: true });
mkdirSync(TARGET_DIR, { recursive: true });

for (const dir of migrationDirs) {
  copyFileSync(
    join(SOURCE_DIR, dir, 'migration.sql'),
    join(TARGET_DIR, `${dir}.sql`)
  );
}

console.log(
  `[flatten-migrations] ${migrationDirs.length} migrations → drizzle/migrations-wrangler/`
);
