/**
 * Shared D1 client wiring for seed scripts.
 *
 * Mirrors the env handling in `scripts/seed.ts` so one-off seeders (e.g.
 * `seed-style-sample-videos.ts`) resolve the same databases:
 *   --local        Wrangler local D1 via getPlatformProxy (default env)
 *   --test         Wrangler local D1 via getPlatformProxy ([env.test])
 *   --d1           Cloudflare D1 over the HTTP API (production / CI)
 *
 * Returns the drizzle client plus a `dispose()` that tears down the platform
 * proxy when one was created.
 */
import { createD1HttpClient } from '@/platform/server/db/client-d1-http';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { getLocalPlatformProxy } from './local-platform-proxy';

export type SeedTarget = 'local' | 'test' | 'd1';

export type SeedDb = {
  db: ReturnType<typeof drizzleD1> | ReturnType<typeof createD1HttpClient>;
  dispose: () => Promise<void>;
};

export function parseSeedTarget(argv: string[]): SeedTarget {
  if (argv.includes('--d1')) return 'd1';
  if (argv.includes('--test')) return 'test';
  return 'local';
}

export async function createSeedDb(target: SeedTarget): Promise<SeedDb> {
  if (target === 'd1') {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !databaseId || !token) {
      throw new Error(
        'CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN are required for --d1'
      );
    }
    console.log('🗄️  Using Cloudflare D1 via HTTP API\n');
    return {
      db: createD1HttpClient({ accountId, databaseId, token }),
      dispose: async () => {},
    };
  }

  const environment = target === 'test' ? 'test' : undefined;
  console.log(
    `🗄️  Using Wrangler local D1 (${environment ?? 'default'} env)\n`
  );
  const platformProxy = await getLocalPlatformProxy<{ DB?: D1Database }>({
    environment,
  });
  const d1Binding = platformProxy.env.DB;
  if (!d1Binding) {
    throw new Error(
      `[seed] D1 binding 'DB' missing from wrangler.jsonc ${environment ? `[env.${environment}]` : ''} — cannot seed.`
    );
  }
  return {
    db: drizzleD1(d1Binding),
    dispose: async () => {
      await platformProxy.dispose();
    },
  };
}
