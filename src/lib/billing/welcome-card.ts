/**
 * After a card is on file, grant the card-gated welcome credits (#1516).
 *
 * Server-only: dynamic-imports Stripe so this module is safe to load from
 * `functions/billing.ts` the same way the rest of billing is.
 */

import { SIGNUP_GRANT_MICROS } from '@/lib/billing/constants';
import { microsToUsd } from '@/lib/billing/money';
import { grantSignupCredits } from '@/lib/billing/welcome-grants';
import type { ScopedDb } from '@/lib/db/scoped';
import { captureProductEvent } from '@/lib/observability/product-events';

import { getLogger } from '@/lib/observability/logger';

const logger = getLogger(['openstory', 'billing', 'welcome-card']);

export async function fulfillSavedCard(opts: {
  scopedDb: ScopedDb;
  teamId: string;
  userId: string;
  customerId: string;
  paymentMethodId: string;
  source: 'setup_checkout' | 'setup_intent' | 'claim' | 'purchase';
}): Promise<{ granted: boolean }> {
  const { getStripeOrThrow } = await import('@/lib/billing/stripe');
  const stripe = getStripeOrThrow();

  await stripe.customers.update(opts.customerId, {
    invoice_settings: { default_payment_method: opts.paymentMethodId },
  });
  await opts.scopedDb.billing.saveStripeCustomerId(opts.customerId);
  await opts.scopedDb.billing.clearAutoTopUpFailure();

  return grantWelcomeCreditsForTeam({
    scopedDb: opts.scopedDb,
    teamId: opts.teamId,
    userId: opts.userId,
    source: opts.source,
  });
}

export async function grantWelcomeCreditsForTeam(opts: {
  scopedDb: ScopedDb;
  teamId: string;
  userId: string;
  source: string;
}): Promise<{ granted: boolean }> {
  const alreadyGranted = await opts.scopedDb.billing.hasSignupGrant();
  const result = await grantSignupCredits({
    teamId: opts.teamId,
    addCredits: opts.scopedDb.billing.addCredits,
    alreadyGranted,
  });

  if (result.granted) {
    captureProductEvent({
      distinctId: opts.userId,
      event: 'welcome_credits_granted',
      properties: {
        teamId: opts.teamId,
        amount_usd: microsToUsd(SIGNUP_GRANT_MICROS),
        source: opts.source,
      },
    });
  }

  return { granted: result.granted };
}

/**
 * Used on return from Stripe setup (webhook may still be in flight) and as
 * a safety net if the user already has a card from a purchase.
 */
export async function grantWelcomeIfTeamHasCard(opts: {
  scopedDb: ScopedDb;
  teamId: string;
  userId: string;
}): Promise<{ granted: boolean; hasCard: boolean }> {
  const settings = await opts.scopedDb.billing.getBillingSettings();
  if (!settings.stripeCustomerId) {
    return { granted: false, hasCard: false };
  }

  const { getStripeOrThrow } = await import('@/lib/billing/stripe');
  const stripe = getStripeOrThrow();
  const methods = await stripe.paymentMethods.list({
    customer: settings.stripeCustomerId,
    type: 'card',
    limit: 1,
  });
  const pm = methods.data[0];
  if (!pm) return { granted: false, hasCard: false };

  try {
    const { granted } = await fulfillSavedCard({
      scopedDb: opts.scopedDb,
      teamId: opts.teamId,
      userId: opts.userId,
      customerId: settings.stripeCustomerId,
      paymentMethodId: pm.id,
      source: 'claim',
    });
    return { granted, hasCard: true };
  } catch (err) {
    logger.error('Failed to grant welcome credits for a saved card', {
      teamId: opts.teamId,
      err,
    });
    throw err;
  }
}
