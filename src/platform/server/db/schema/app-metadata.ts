/**
 * App Metadata Schema
 * Small key/value store for app-level bookkeeping (e.g. the system-template
 * seed hash that gates the runtime self-seed in src/server.ts).
 */

import { integer, snakeCase, text } from 'drizzle-orm/sqlite-core';

export const appMetadata = snakeCase.table('app_metadata', {
  key: text({ length: 255 }).primaryKey().notNull(),
  value: text().notNull(),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
});
