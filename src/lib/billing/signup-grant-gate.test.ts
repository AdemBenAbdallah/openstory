import { describe, expect, it, vi } from 'vitest';

const env: { E2E_TEST?: string; STRIPE_SECRET_KEY?: string } = {};

vi.doMock('#env', () => ({
  getEnv: () => env,
}));

const { grantsWelcomeCreditsOnSignup } = await import('./constants');

describe('grantsWelcomeCreditsOnSignup', () => {
  it('credits at team create when Stripe is not configured', () => {
    env.E2E_TEST = undefined;
    env.STRIPE_SECRET_KEY = undefined;
    expect(grantsWelcomeCreditsOnSignup()).toBe(true);
  });

  it('does not credit at team create when Stripe is configured', () => {
    env.E2E_TEST = undefined;
    env.STRIPE_SECRET_KEY = 'sk_test_x';
    expect(grantsWelcomeCreditsOnSignup()).toBe(false);
  });

  it('still credits at team create under e2e', () => {
    env.E2E_TEST = 'true';
    env.STRIPE_SECRET_KEY = undefined;
    expect(grantsWelcomeCreditsOnSignup()).toBe(true);
  });

  it('still credits under e2e when a Stripe key is also set', () => {
    env.E2E_TEST = 'true';
    env.STRIPE_SECRET_KEY = 'sk_test_x';
    expect(grantsWelcomeCreditsOnSignup()).toBe(true);
  });
});
