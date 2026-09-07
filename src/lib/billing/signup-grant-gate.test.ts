import { describe, expect, it, vi } from 'vitest';

const env: { E2E_TEST?: string; STRIPE_SECRET_KEY?: string } = {};

vi.doMock('#env', () => ({
  getEnv: () => env,
}));

const { grantsWelcomeCreditsOnSignup } = await import('./constants');

describe('grantsWelcomeCreditsOnSignup', () => {
  it('does not credit $20 at team create, even without Stripe', () => {
    env.E2E_TEST = undefined;
    env.STRIPE_SECRET_KEY = undefined;
    expect(grantsWelcomeCreditsOnSignup()).toBe(false);
  });

  it('does not credit $20 at team create when Stripe is configured', () => {
    env.E2E_TEST = undefined;
    env.STRIPE_SECRET_KEY = 'sk_test_x';
    expect(grantsWelcomeCreditsOnSignup()).toBe(false);
  });

  it('still credits at team create under e2e', () => {
    env.E2E_TEST = 'true';
    env.STRIPE_SECRET_KEY = undefined;
    expect(grantsWelcomeCreditsOnSignup()).toBe(true);
  });
});
