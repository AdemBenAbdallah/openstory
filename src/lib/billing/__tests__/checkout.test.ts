import type { ScopedDb } from '@/lib/db/scoped';
import { describe, expect, it, vi } from 'vitest';

const create = vi.fn();
const paymentMethodsList = vi.fn();
vi.doMock('../stripe', () => ({
  getStripeOrThrow: () => ({
    customers: {
      retrieve: vi.fn().mockResolvedValue({ deleted: false }),
      create: vi.fn().mockResolvedValue({ id: 'cus_new' }),
      update: vi.fn(),
    },
    checkout: {
      sessions: { create },
    },
    paymentMethods: {
      list: paymentMethodsList,
      retrieve: vi.fn(),
    },
  }),
}));

const captureProductEvent = vi.fn();
vi.doMock('@/lib/observability/product-events', () => ({
  captureProductEvent,
}));

const {
  createCheckoutSession,
  createSetupCheckoutSession,
  grantWelcomeIfTeamHasCard,
} = await import('../checkout');

function makeScopedDb() {
  const stub = {
    billing: {
      getBillingSettings: vi
        .fn()
        .mockResolvedValue({ stripeCustomerId: 'cus_1' }),
      saveStripeCustomerId: vi.fn(),
    },
  };
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- minimal ScopedDb stub
  return stub as unknown as ScopedDb;
}

describe('createCheckoutSession', () => {
  it('charges credit + fee line items but metadata stores credit-only amountUsd', async () => {
    create.mockResolvedValue({
      id: 'cs_1',
      url: 'https://checkout.stripe.com/test',
      payment_intent: 'pi_1',
    });
    captureProductEvent.mockClear();

    await createCheckoutSession({
      scopedDb: makeScopedDb(),
      teamId: 'team_1',
      amountUsd: 100,
      userId: 'user_1',
      userEmail: 'test@example.com',
      successUrl: 'https://app/success',
      cancelUrl: 'https://app/cancel',
      surface: 'sidebar_pill',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const session = create.mock.calls[0]?.[0];
    expect(session.line_items).toEqual([
      expect.objectContaining({
        price_data: expect.objectContaining({ unit_amount: 10_000 }),
      }),
      expect.objectContaining({
        // 7% platform fee on $100 credits → $7.00
        price_data: expect.objectContaining({ unit_amount: 700 }),
      }),
    ]);
    expect(session.metadata).toMatchObject({
      amountUsd: '100',
      type: 'credit_top_up',
      method: 'checkout',
      surface: 'sidebar_pill',
    });
    expect(session.payment_intent_data.metadata).toEqual(session.metadata);
    expect(captureProductEvent).toHaveBeenCalledWith({
      distinctId: 'user_1',
      event: 'checkout_opened',
      properties: expect.objectContaining({
        teamId: 'team_1',
        amount_usd: 100,
        method: 'checkout',
        stripe_checkout_session_id: 'cs_1',
        stripe_payment_intent_id: 'pi_1',
        surface: 'sidebar_pill',
      }),
    });
  });

  it('saves a card with Checkout setup mode and no charge', async () => {
    create.mockReset();
    create.mockResolvedValue({
      id: 'cs_setup',
      url: 'https://checkout.stripe.com/setup',
    });
    captureProductEvent.mockClear();

    await createSetupCheckoutSession({
      scopedDb: makeScopedDb(),
      teamId: 'team_1',
      userId: 'user_1',
      userEmail: 'test@example.com',
      successUrl:
        'https://app/?welcome_setup=success&session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://app/?welcome_setup=canceled',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const session = create.mock.calls[0]?.[0];
    expect(session.mode).toBe('setup');
    expect(session.line_items).toBeUndefined();
    expect(session.metadata).toEqual({
      teamId: 'team_1',
      userId: 'user_1',
      type: 'save_card',
    });
    expect(session.success_url).toContain('welcome_setup=success');
    expect(session.cancel_url).toContain('welcome_setup=canceled');
    expect(session.setup_intent_data.metadata).toEqual(session.metadata);
    expect(captureProductEvent).toHaveBeenCalledWith({
      distinctId: 'user_1',
      event: 'welcome_card_setup_opened',
      properties: expect.objectContaining({
        teamId: 'team_1',
        stripe_checkout_session_id: 'cs_setup',
      }),
    });
  });
});

describe('grantWelcomeIfTeamHasCard', () => {
  it('does not grant when the team has no Stripe customer', async () => {
    const addCredits = vi.fn();
    const stub = {
      billing: {
        getBillingSettings: vi
          .fn()
          .mockResolvedValue({ stripeCustomerId: null }),
        hasSignupGrant: vi.fn().mockResolvedValue(false),
        addCredits,
      },
    };
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- test double
    const scopedDb = stub as unknown as ScopedDb;

    const result = await grantWelcomeIfTeamHasCard({
      scopedDb,
      teamId: 'team_1',
      userId: 'user_1',
    });

    expect(result).toEqual({
      granted: false,
      hasCard: false,
      hasSignupGrant: false,
    });
    expect(addCredits).not.toHaveBeenCalled();
  });

  it('does not grant when the customer has no saved card', async () => {
    const addCredits = vi.fn();
    paymentMethodsList.mockResolvedValue({ data: [] });
    const stub = {
      billing: {
        getBillingSettings: vi
          .fn()
          .mockResolvedValue({ stripeCustomerId: 'cus_1' }),
        hasSignupGrant: vi.fn().mockResolvedValue(false),
        addCredits,
      },
    };
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- test double
    const scopedDb = stub as unknown as ScopedDb;

    const result = await grantWelcomeIfTeamHasCard({
      scopedDb,
      teamId: 'team_1',
      userId: 'user_1',
    });

    expect(result).toEqual({
      granted: false,
      hasCard: false,
      hasSignupGrant: false,
    });
    expect(addCredits).not.toHaveBeenCalled();
  });
});
