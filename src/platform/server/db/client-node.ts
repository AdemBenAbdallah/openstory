/**
 * Drizzle Database Client — Node / unit-test context.
 *
 * Activated by the `default` import condition in package.json's `imports.#db-client`
 * (i.e. anything that isn't Workerd or Storybook: plain Node, Vitest).
 *
 * The app only touches the database inside Workerd, where `#db-client` resolves
 * to `client-d1.ts` (Cloudflare D1). This module exists so that:
 *   - `Database` (`ReturnType<typeof getDb>`) is typed against the libSQL driver
 *     that unit tests inject via `drizzle({ client, relations })` from an
 *     in-memory `@libsql/client` database.
 *   - any Node code that reaches `getDb()` without injecting its own instance
 *     fails loudly instead of silently connecting somewhere unexpected.
 */

import type { Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { relations } from '@/platform/server/db/schema/relations';

type Database = ReturnType<typeof buildDb>;

// Never executed — only its return type defines `Database`, mirroring the
// in-memory libSQL instances unit tests construct and pass around.
function buildDb(client: Client) {
  return drizzle({ client, relations });
}

export const getDb = (): Database => {
  throw new Error(
    '[db-node] getDb() is only available in the Workerd runtime (Cloudflare D1). Node and test code must inject a database instance.'
  );
};
