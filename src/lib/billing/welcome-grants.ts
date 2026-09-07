/**
 * Card-gated welcome credits (#1516).
 *
 * Hosted Stripe: the $20 signup grant waits for a saved card. Enabling
 * auto-reload adds a one-shot $10 bonus. Self-host / e2e still grant at
 * team create (see `grantsWelcomeCreditsOnSignup`).
 */

import {
  AUTO_TOPUP_BONUS_MICROS,
  SIGNUP_GRANT_MICROS,
} from '@/lib/billing/constants';
import { type Microdollars, microsToDisplayUsd } from '@/lib/billing/money';
import type { TransactionType } from '@/lib/db/schema/credits';

export function signupGrantIdempotencyKey(teamId: string): string {
  return `signup-grant:${teamId}`;
}

export function autoTopUpBonusIdempotencyKey(teamId: string): string {
  return `auto-topup-bonus:${teamId}`;
}

type AddCredits = (
  amountMicros: Microdollars,
  opts: {
    type?: TransactionType;
    description?: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  }
) => Promise<{ newBalance: Microdollars; transactionId: string } | null>;

export async function grantSignupCredits(opts: {
  teamId: string;
  addCredits: AddCredits;
  alreadyGranted: boolean;
}): Promise<{ granted: boolean; newBalance?: Microdollars }> {
  if (opts.alreadyGranted) return { granted: false };

  const result = await opts.addCredits(SIGNUP_GRANT_MICROS, {
    type: 'credit_adjustment',
    description: `Welcome credit: ${microsToDisplayUsd(SIGNUP_GRANT_MICROS)}`,
    idempotencyKey: signupGrantIdempotencyKey(opts.teamId),
    metadata: { signupGrant: true, gatedByCard: true },
  });

  if (!result) return { granted: false };
  return { granted: true, newBalance: result.newBalance };
}

export async function grantAutoTopUpBonus(opts: {
  teamId: string;
  addCredits: AddCredits;
}): Promise<{ granted: boolean; newBalance?: Microdollars }> {
  const result = await opts.addCredits(AUTO_TOPUP_BONUS_MICROS, {
    type: 'credit_adjustment',
    description: `Auto-reload bonus: ${microsToDisplayUsd(AUTO_TOPUP_BONUS_MICROS)}`,
    idempotencyKey: autoTopUpBonusIdempotencyKey(opts.teamId),
    metadata: { autoTopUpBonus: true },
  });

  if (!result) return { granted: false };
  return { granted: true, newBalance: result.newBalance };
}

export type WelcomeDialogMode = 'claim' | 'gift' | 'none';

/**
 * Which welcome surface to show.
 *
 * - `claim`: Stripe is on and the team has not spent credits yet. Saving a
 *   card unlocks $20 (or is already done if the grant landed). Auto-reload
 *   is the +$10. Also used while returning from Stripe setup.
 * - `gift`: unused signup grant with no Stripe (self-host / e2e). Same
 *   moment as #1096 — there is no card to save.
 * - `none`: already spent credits.
 */
export function welcomeDialogMode(input: {
  stripeEnabled: boolean;
  hasSignupGrant: boolean;
  hasUsedCredits: boolean;
  setupPending: boolean;
}): WelcomeDialogMode {
  if (input.setupPending) return 'claim';
  if (input.hasUsedCredits) return 'none';
  // Hosted Stripe: the checklist IS the welcome, including for teams that
  // already have the grant (save-card may still be outstanding; auto-reload
  // bonus is still on the table).
  if (input.stripeEnabled) return 'claim';
  if (input.hasSignupGrant) return 'gift';
  return 'none';
}
