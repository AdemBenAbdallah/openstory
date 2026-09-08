/**
 * Tell the customer their auto-reload was declined (#1499). Once per
 * decline — `recordAutoTopUpFailure` owns that guarantee.
 */

import { type Microdollars, microsToDisplayUsd } from '@/billing/money';
import type { Database } from '@/platform/server/db/client';
import { teamMembers } from '@/platform/server/db/schema/teams';
import { user } from '@/platform/server/db/schema/auth';
import { getLogger } from '@/platform/logger';
import { captureProductEvent } from '@/platform/server/observability/product-events';
import { sendAutoTopUpFailedEmail } from './auto-top-up-failed-email';
import { SITE_CONFIG } from '@/ui/marketing/constants';
import { and, eq } from 'drizzle-orm';

const logger = getLogger(['openstory', 'emails', 'auto-top-up-failed']);

/**
 * Billing contact = the team owner, not the user whose generation happened
 * to trip the debit — they may not be the one holding the card.
 */
async function getBillingContactEmail(
  db: Database,
  teamId: string
): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(teamMembers)
    .innerJoin(user, eq(teamMembers.userId, user.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'owner')))
    .limit(1);
  return row?.email ?? null;
}

export async function notifyAutoTopUpFailed(opts: {
  db: Database;
  teamId: string;
  userId: string;
  balanceMicros: Microdollars;
}): Promise<void> {
  const to = await getBillingContactEmail(opts.db, opts.teamId);
  if (!to) {
    logger.warn('No billing contact for declined auto top-up', {
      teamId: opts.teamId,
    });
    return;
  }

  const result = await sendAutoTopUpFailedEmail({
    to,
    billingUrl: `${SITE_CONFIG.url.replace(/\/$/, '')}/credits`,
    balanceDisplay: microsToDisplayUsd(opts.balanceMicros),
  });

  if (!result.success) {
    throw new Error(result.error ?? 'Failed to send auto-top-up-failed email');
  }

  captureProductEvent({
    distinctId: opts.userId,
    event: 'auto_top_up_failed_email_sent',
    properties: { team_id: opts.teamId },
  });
}
