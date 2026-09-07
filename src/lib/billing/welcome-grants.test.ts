import {
  AUTO_TOPUP_BONUS_MICROS,
  SIGNUP_GRANT_MICROS,
} from '@/lib/billing/constants';
import { micros } from '@/lib/billing/money';
import type { Database } from '@/lib/db/client';
import { generateId } from '@/shared/id';
import { credits, teams, transactions, user } from '@/lib/db/schema';
import { relations } from '@/lib/db/schema/relations';
import { type Client, createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBillingMethods } from '@/lib/db/scoped/billing';
import {
  grantAutoTopUpBonus,
  grantSignupCredits,
  welcomeDialogMode,
} from './welcome-grants';

describe('welcomeDialogMode', () => {
  it('asks for a card when Stripe is on and the welcome grant is still unpaid', () => {
    expect(
      welcomeDialogMode({
        stripeEnabled: true,
        hasSignupGrant: false,
        hasUsedCredits: false,
        setupPending: false,
      })
    ).toBe('claim');
  });

  it('keeps the claim checklist on Stripe after the grant so auto-reload is still offered', () => {
    expect(
      welcomeDialogMode({
        stripeEnabled: true,
        hasSignupGrant: true,
        hasUsedCredits: false,
        setupPending: false,
      })
    ).toBe('claim');
  });

  it('keeps the unused-gift dialog when Stripe is off', () => {
    expect(
      welcomeDialogMode({
        stripeEnabled: false,
        hasSignupGrant: true,
        hasUsedCredits: false,
        setupPending: false,
      })
    ).toBe('gift');
  });

  it('never shows once the team has spent credits', () => {
    expect(
      welcomeDialogMode({
        stripeEnabled: true,
        hasSignupGrant: false,
        hasUsedCredits: true,
        setupPending: false,
      })
    ).toBe('none');
  });

  it('reopens the claim checklist while returning from Stripe setup', () => {
    expect(
      welcomeDialogMode({
        stripeEnabled: true,
        hasSignupGrant: true,
        hasUsedCredits: false,
        setupPending: true,
      })
    ).toBe('claim');
  });
});

describe('welcome credit grants', () => {
  let client: Client;
  let db: Database;
  let teamId = '';
  let userId = '';

  async function seed() {
    await db.delete(transactions);
    await db.delete(credits);
    await db.delete(teams);
    await db.delete(user);

    teamId = generateId();
    userId = generateId();
    await db.insert(teams).values({ id: teamId, name: 'T', slug: 't' });
    await db
      .insert(user)
      .values({ id: userId, name: 'U', email: `${userId}@example.com` });
  }

  beforeAll(async () => {
    client = createClient({ url: ':memory:' });
    db = drizzle({ client, relations });
    await migrate(db, { migrationsFolder: './drizzle/migrations' });
  });

  afterAll(() => {
    client.close();
  });

  beforeEach(async () => {
    await seed();
  });

  it('credits the welcome grant once, then no-ops on replay', async () => {
    const billing = createBillingMethods(db, teamId, userId);
    expect(await billing.hasSignupGrant()).toBe(false);

    const first = await grantSignupCredits({
      teamId,
      addCredits: billing.addCredits,
      alreadyGranted: await billing.hasSignupGrant(),
    });
    expect(first.granted).toBe(true);
    expect(first.newBalance).toBe(SIGNUP_GRANT_MICROS);
    expect(await billing.hasSignupGrant()).toBe(true);

    const second = await grantSignupCredits({
      teamId,
      addCredits: billing.addCredits,
      alreadyGranted: await billing.hasSignupGrant(),
    });
    expect(second.granted).toBe(false);
    expect(await billing.getBalance()).toBe(SIGNUP_GRANT_MICROS);
  });

  it('treats a pre-gate signupGrant metadata row as already granted', async () => {
    const billing = createBillingMethods(db, teamId, userId);
    await billing.addCredits(SIGNUP_GRANT_MICROS, {
      type: 'credit_adjustment',
      description: 'Welcome credit: $20.00',
      metadata: { signupGrant: true },
    });
    expect(await billing.hasSignupGrant()).toBe(true);

    const result = await grantSignupCredits({
      teamId,
      addCredits: billing.addCredits,
      alreadyGranted: true,
    });
    expect(result.granted).toBe(false);
    expect(await billing.getBalance()).toBe(SIGNUP_GRANT_MICROS);
  });

  it('credits the auto-reload bonus once', async () => {
    const billing = createBillingMethods(db, teamId, userId);
    await billing.addCredits(micros(1_000_000), {
      type: 'credit_adjustment',
      description: 'seed',
    });

    const first = await grantAutoTopUpBonus({
      teamId,
      addCredits: billing.addCredits,
    });
    expect(first.granted).toBe(true);
    expect(first.newBalance).toBe(micros(1_000_000 + AUTO_TOPUP_BONUS_MICROS));
    expect(await billing.hasAutoTopUpBonus()).toBe(true);

    const second = await grantAutoTopUpBonus({
      teamId,
      addCredits: billing.addCredits,
    });
    expect(second.granted).toBe(false);
    expect(await billing.getBalance()).toBe(
      micros(1_000_000 + AUTO_TOPUP_BONUS_MICROS)
    );
  });
});
