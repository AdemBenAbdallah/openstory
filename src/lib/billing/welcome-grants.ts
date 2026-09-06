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
 * - `claim`: Stripe is on and the team has not received the signup grant.
 *   Saving a card is the unlock. Also used while returning from Stripe
 *   setup so the checklist can flip to done + the auto-reload bonus.
 * - `gift`: unused signup grant that was given without a card (self-host /
 *   e2e / grandfathered teams). Same moment as #1096.
 * - `none`: already spent credits, or hosted Stripe after the grant landed
 *   (they just claimed it — don't re-open the old gift nag).
 */
export function welcomeDialogMode(input: {
  stripeEnabled: boolean;
  hasSignupGrant: boolean;
  hasUsedCredits: boolean;
  setupPending: boolean;
}): WelcomeDialogMode {
  if (input.setupPending) return 'claim';
  if (input.hasUsedCredits) return 'none';
  if (input.stripeEnabled && !input.hasSignupGrant) return 'claim';
  // Unused grant that appeared without a card (self-host / e2e / grandfathered).
  if (input.hasSignupGrant && !input.stripeEnabled) return 'gift';
  return 'none';
}
