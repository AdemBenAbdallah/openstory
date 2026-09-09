/**
 * Drizzle Database Client
 *
 * The driver is selected at build time via the `#db-client` conditional export
 * in package.json:
 * - workerd: Cloudflare D1 (native serverless SQLite) — used in dev and prod,
 *   both of which run in Workerd via @cloudflare/vite-plugin.
 * - storybook: a dependency-free throwing stub (Storybook never hits the DB).
 * - default: a libSQL-typed Node/test client; the app never reaches it at
 *   runtime (unit tests inject their own in-memory libSQL instance).
 */

import { getDb } from '#db-client';

/**
 * Type alias for the database instance
 * Use this type when passing the db instance as a parameter
 */
export type Database = ReturnType<typeof getDb>;
