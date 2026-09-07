/**
 * Welcome Credits Dialog (#1096, #1516)
 *
 * Two surfaces, one provider:
 *
 * - **claim** (hosted Stripe, no signup grant yet): unlock $20 by saving a
 *   card (no charge). Auto-reload is a separate +$10. GitHub/X are listed
 *   as optional, not as credit tasks.
 * - **gift** (self-host / e2e / grandfathered unused grant): the original
 *   "you have $20" nudge. Re-shows every RESHOW_INTERVAL_MS until the team
 *   spends credits.
 *
 * Dismiss cadence lives in localStorage (house pattern for UI prefs).
 */

import { GitHubIcon } from '@/components/icons/github-icon';
import { XIcon } from '@/components/icons/x-icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  claimWelcomeCreditsFn,
  createSetupCheckoutSessionFn,
  listPaymentMethodsFn,
  updateAutoTopUpFn,
} from '@/functions/billing';
import { openAddCreditsDialog } from '@/hooks/use-add-credits-dialog';
import {
  BILLING_BALANCE_KEY,
  useBillingBalance,
} from '@/hooks/use-billing-balance';
import { BILLING_GATE_KEY } from '@/hooks/use-billing-gate';
import { useShowCosts } from '@/hooks/use-show-costs';
import { useUser } from '@/hooks/use-user';
import {
  AUTO_TOPUP_BONUS_MICROS,
  MIN_TOPUP_AMOUNT_USD,
  SIGNUP_GRANT_MICROS,
  WELCOME_AUTO_TOPUP_THRESHOLD_USD,
} from '@/lib/billing/constants';
import { microsToDisplayUsd } from '@/lib/billing/money';
import {
  welcomeDialogMode,
  type WelcomeDialogMode,
} from '@/lib/billing/welcome-grants';
import { SITE_CONFIG } from '@/shared/marketing/constants';
import { hasPendingGenerate } from '@/shared/generation/pending-generate';
import { cn } from '@/shared/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, RefreshCw, Sparkles } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/** Last dismiss timestamp (ms since epoch). */
const DISMISSED_AT_KEY = 'openstory:welcome-credits-dismissed-at';
/** Legacy one-shot flag — cleared so new re-show rules can apply. */
const LEGACY_SEEN_KEY = 'openstory:welcome-credits-seen';
/** Survives the Stripe setup redirect so we don't treat it as a dismiss. */
const SETUP_PENDING_KEY = 'openstory:welcome-setup-pending';

/** Re-show after dismiss until the team has actually spent credits. */
const RESHOW_INTERVAL_MS = 3 * 60 * 60 * 1000;

const GRANT_DISPLAY = microsToDisplayUsd(SIGNUP_GRANT_MICROS);
const BONUS_DISPLAY = microsToDisplayUsd(AUTO_TOPUP_BONUS_MICROS);

function readDismissedAt(): number | null {
  try {
    // Drop the old permanent "seen" flag without treating it as a fresh
    // dismiss — otherwise anyone who hit the one-shot dialog is blocked
    // for 3h every time we migrate.
    if (localStorage.getItem(LEGACY_SEEN_KEY)) {
      localStorage.removeItem(LEGACY_SEEN_KEY);
    }

    const raw = localStorage.getItem(DISMISSED_AT_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    // private mode / quota
    return null;
  }
}

function writeDismissedAt(): void {
  try {
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    localStorage.removeItem(LEGACY_SEEN_KEY);
  } catch {
    // private mode / quota
  }
}

function markSetupPending(): void {
  try {
    sessionStorage.setItem(SETUP_PENDING_KEY, '1');
  } catch {
    // private mode / quota
  }
}

function isSetupPending(): boolean {
  try {
    return sessionStorage.getItem(SETUP_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

function clearSetupPending(): void {
  try {
    sessionStorage.removeItem(SETUP_PENDING_KEY);
  } catch {
    // private mode / quota
  }
}

/**
 * Whether the welcome-credits moment is still in the way: the show/skip
 * decision hasn't settled yet, or the dialog is open. Deferred flows (the
 * composer's resume-after-sign-in Generate, #1187) wait on this so they don't
 * stack their own dialog on top of the welcome gift. Permissive outside the
 * provider (stories/tests): nothing blocks.
 */
const WelcomeCreditsContext = createContext<{ blocking: boolean } | null>(null);

export function useWelcomeCreditsGate(): { blocking: boolean } {
  return useContext(WelcomeCreditsContext) ?? { blocking: false };
}

export const WelcomeCreditsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { data: user } = useUser();
  const { showCosts, setShowCosts } = useShowCosts();
  const queryClient = useQueryClient();
  const {
    data: balanceData,
    stripeEnabled,
    hasUsedCredits,
    hasSignupGrant,
    hasAutoTopUpBonus,
    isSuccess: balanceReady,
    isError: balanceFailed,
  } = useBillingBalance();
  const autoTopUpEnabled = balanceData?.autoTopUp.enabled ?? false;
  const [open, setOpen] = useState(false);
  // The show/skip decision has been made (dialog opened, or decided not to).
  const [settled, setSettled] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const setupPending = useSyncExternalStore(
    () => () => {},
    isSetupPending,
    () => false
  );
  const redirectingToStripe = useRef(false);

  const mode: WelcomeDialogMode = welcomeDialogMode({
    stripeEnabled,
    hasSignupGrant,
    hasUsedCredits,
    setupPending,
  });

  useEffect(() => {
    if (!user) return;
    // Free credits off (#1529): nothing to announce.
    if (SIGNUP_GRANT_MICROS <= 0) {
      setSettled(true);
      return;
    }
    // Wait until balance query settles (success or error). Don't use isFetched
    // alone — while the query is disabled it stays false forever.
    if (!balanceReady && !balanceFailed) return;

    if (setupPending) {
      setOpen(true);
      setSettled(true);
      return;
    }

    if (mode === 'none') {
      setSettled(true);
      return;
    }

    const dismissedAt = readDismissedAt();
    if (dismissedAt != null && Date.now() - dismissedAt < RESHOW_INTERVAL_MS) {
      setSettled(true);
      return;
    }
    setOpen(true);
    setSettled(true);
  }, [user, mode, setupPending, balanceReady, balanceFailed]);

  const handleOpenChange = (next: boolean) => {
    if (!next && redirectingToStripe.current) {
      // Full-page navigate to Stripe — don't treat unload as a dismiss.
      return;
    }
    setOpen(next);
    if (!next) {
      writeDismissedAt();
      clearSetupPending();
      setSetupError(null);
    }
  };

  const { data: pmData } = useQuery({
    queryKey: ['billing-payment-methods'],
    queryFn: () => listPaymentMethodsFn(),
    enabled: Boolean(user && stripeEnabled && mode === 'claim'),
    staleTime: 60_000,
  });
  const hasSavedCard = (pmData?.paymentMethods.length ?? 0) > 0;

  const setupMutation = useMutation({
    meta: { inlineError: true },
    mutationFn: () => createSetupCheckoutSessionFn(),
    onSuccess: (data) => {
      markSetupPending();
      window.location.href = data.url;
    },
    onError: (err) => {
      redirectingToStripe.current = false;
      setSetupError(
        err instanceof Error ? err.message : 'Could not open card setup'
      );
    },
  });

  const autoTopUpMutation = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      updateAutoTopUpFn({
        data: {
          enabled: true,
          thresholdUsd: WELCOME_AUTO_TOPUP_THRESHOLD_USD,
          amountUsd: MIN_TOPUP_AMOUNT_USD,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...BILLING_BALANCE_KEY],
      });
      void queryClient.invalidateQueries({ queryKey: [...BILLING_GATE_KEY] });
      void queryClient.invalidateQueries({
        queryKey: ['billing-payment-methods'],
      });
    },
    onError: (err) => {
      setSetupError(
        err instanceof Error ? err.message : 'Could not enable auto-reload'
      );
    },
  });

  const returnedFromStripe =
    setupPending && !setupMutation.isPending && !redirectingToStripe.current;

  const claimQuery = useQuery({
    queryKey: ['welcome-credits-claim', user?.id],
    queryFn: async () => {
      const result = await claimWelcomeCreditsFn();
      await queryClient.invalidateQueries({
        queryKey: [...BILLING_BALANCE_KEY],
      });
      await queryClient.invalidateQueries({ queryKey: [...BILLING_GATE_KEY] });
      await queryClient.invalidateQueries({
        queryKey: ['billing-payment-methods'],
      });
      return result;
    },
    enabled: Boolean(user && open && returnedFromStripe),
    retry: false,
  });

  // Signed-in with the decision still pending counts as blocking, so a
  // deferred flow can't jump in just before the dialog opens. After the
  // card-gated grant lands, Generate can proceed even if the auto-reload
  // offer is still up.
  const value = useMemo(
    () => ({
      blocking:
        (!!user && !settled) ||
        (open && (mode === 'gift' || (mode === 'claim' && !hasSignupGrant))),
    }),
    [user, settled, open, mode, hasSignupGrant]
  );

  // False on the server; only VISIBLE while the dialog is open (client-only,
  // after the localStorage intent exists), so no SSR/hydration mismatch.
  const primaryLabel = hasPendingGenerate()
    ? 'Keep creating'
    : 'Start creating';

  return (
    <WelcomeCreditsContext.Provider value={value}>
      {children}
      <Dialog open={open && mode !== 'none'} onOpenChange={handleOpenChange}>
        {mode === 'claim' ? (
          <ClaimDialogContent
            grantDisplay={GRANT_DISPLAY}
            bonusDisplay={BONUS_DISPLAY}
            hasSavedCard={hasSavedCard}
            hasAutoTopUpBonus={hasAutoTopUpBonus}
            autoTopUpEnabled={autoTopUpEnabled}
            showCosts={showCosts}
            onShowCostsChange={setShowCosts}
            setupError={
              setupError ??
              (claimQuery.error instanceof Error
                ? claimQuery.error.message
                : claimQuery.isError
                  ? 'Could not unlock credits yet'
                  : null)
            }
            setupPending={setupMutation.isPending}
            autoTopUpPending={autoTopUpMutation.isPending}
            onSaveCard={() => {
              setSetupError(null);
              markSetupPending();
              redirectingToStripe.current = true;
              setupMutation.mutate();
            }}
            onEnableAutoTopUp={() => {
              setSetupError(null);
              autoTopUpMutation.mutate();
            }}
            onSkip={() => handleOpenChange(false)}
            primaryLabel={primaryLabel}
          />
        ) : (
          <GiftDialogContent
            grantDisplay={GRANT_DISPLAY}
            showCosts={showCosts}
            onShowCostsChange={setShowCosts}
            stripeEnabled={stripeEnabled}
            onBuyMore={() => {
              handleOpenChange(false);
              openAddCreditsDialog('welcome_dialog');
            }}
            onStart={() => handleOpenChange(false)}
            primaryLabel={primaryLabel}
          />
        )}
      </Dialog>
    </WelcomeCreditsContext.Provider>
  );
};

type ClaimDialogContentProps = {
  grantDisplay: string;
  bonusDisplay: string;
  hasSavedCard: boolean;
  hasAutoTopUpBonus: boolean;
  autoTopUpEnabled: boolean;
  showCosts: boolean;
  onShowCostsChange: (value: boolean) => void;
  setupError: string | null;
  setupPending: boolean;
  autoTopUpPending: boolean;
  onSaveCard: () => void;
  onEnableAutoTopUp: () => void;
  onSkip: () => void;
  primaryLabel: string;
};

function ClaimDialogContent({
  grantDisplay,
  bonusDisplay,
  hasSavedCard,
  hasAutoTopUpBonus,
  autoTopUpEnabled,
  showCosts,
  onShowCostsChange,
  setupError,
  setupPending,
  autoTopUpPending,
  onSaveCard,
  onEnableAutoTopUp,
  onSkip,
  primaryLabel,
}: ClaimDialogContentProps) {
  const autoReloadDone = hasAutoTopUpBonus || autoTopUpEnabled;

  return (
    <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
      <WelcomeHeader
        amount={grantDisplay}
        description="Save a card to unlock it. We won't charge you — it just confirms you're a real person."
      />

      <div className="flex flex-col gap-4 px-6 py-5">
        <ul className="flex flex-col gap-2">
          <TaskRow
            done={hasSavedCard}
            icon={<CreditCard className="size-4" aria-hidden />}
            title="Save a card"
            detail={`No payment today. Unlocks ${grantDisplay}.`}
            reward={grantDisplay}
            action={
              hasSavedCard ? null : (
                <Button size="sm" onClick={onSaveCard} disabled={setupPending}>
                  {setupPending ? 'Opening…' : 'Save card'}
                </Button>
              )
            }
          />
          <TaskRow
            done={autoReloadDone}
            icon={<RefreshCw className="size-4" aria-hidden />}
            title="Turn on auto-reload"
            detail={`Adds $${MIN_TOPUP_AMOUNT_USD} when your balance hits $${WELCOME_AUTO_TOPUP_THRESHOLD_USD}. Change anytime.`}
            reward={`+${bonusDisplay}`}
            action={
              autoReloadDone ? null : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onEnableAutoTopUp}
                  disabled={!hasSavedCard || autoTopUpPending}
                >
                  {autoTopUpPending ? 'Enabling…' : 'Enable'}
                </Button>
              )
            }
          />
        </ul>

        <p className="text-xs text-muted-foreground">
          Optional, no credits —{' '}
          <a
            href={SITE_CONFIG.githubHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
          >
            <GitHubIcon className="size-3" />
            Star on GitHub
          </a>
          {' · '}
          <a
            href={SITE_CONFIG.xHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
          >
            <XIcon className="size-3" />
            Follow on X
          </a>
        </p>

        <ShowCostsRow checked={showCosts} onCheckedChange={onShowCostsChange} />

        {setupError ? (
          <p role="alert" className="text-xs text-destructive">
            {setupError}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-stretch">
          {hasSavedCard ? (
            <Button className="sm:flex-1" onClick={onSkip}>
              {primaryLabel}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="sm:flex-1"
              onClick={onSkip}
              disabled={setupPending}
            >
              Skip for now
            </Button>
          )}
        </DialogFooter>
      </div>
    </DialogContent>
  );
}

type GiftDialogContentProps = {
  grantDisplay: string;
  showCosts: boolean;
  onShowCostsChange: (value: boolean) => void;
  stripeEnabled: boolean;
  onBuyMore: () => void;
  onStart: () => void;
  primaryLabel: string;
};

function GiftDialogContent({
  grantDisplay,
  showCosts,
  onShowCostsChange,
  stripeEnabled,
  onBuyMore,
  onStart,
  primaryLabel,
}: GiftDialogContentProps) {
  return (
    <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
      <WelcomeHeader
        amount={grantDisplay}
        description="Free credits on us — enough for a typical 30s short with motion and music. Generations draw from this balance at provider rates."
      />

      <div className="flex flex-col gap-4 px-6 py-5">
        <ShowCostsRow checked={showCosts} onCheckedChange={onShowCostsChange} />

        <DialogFooter className="gap-2 sm:justify-stretch">
          {stripeEnabled ? (
            <Button variant="outline" className="sm:flex-1" onClick={onBuyMore}>
              Buy more
            </Button>
          ) : null}
          <Button className="sm:flex-1" onClick={onStart}>
            {primaryLabel}
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  );
}

function WelcomeHeader({
  amount,
  description,
}: {
  amount: string;
  description: string;
}) {
  return (
    <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/20 via-primary/10 to-transparent px-6 pb-6 pt-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-primary/15 blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -left-6 size-32 rounded-full bg-emerald-500/10 blur-2xl"
      />

      <div className="relative flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/15">
          <Sparkles className="size-6" aria-hidden />
        </div>
        <p className="text-xs font-medium uppercase tracking-widest text-primary">
          Welcome gift
        </p>
        <DialogHeader className="items-center gap-1.5 sm:text-center">
          <DialogTitle className="font-heading text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
            {amount}
          </DialogTitle>
          <DialogDescription className="max-w-xs text-sm leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>
      </div>
    </div>
  );
}

function ShowCostsRow({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-3.5">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">Show costs</p>
        <p className="text-xs text-muted-foreground">
          Balance in the sidebar and estimates under Generate
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label="Show costs"
      />
    </div>
  );
}

function TaskRow({
  done,
  icon,
  title,
  detail,
  reward,
  action,
}: {
  done: boolean;
  icon: ReactNode;
  title: string;
  detail: string;
  reward: string;
  action: ReactNode;
}) {
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-start',
        done
          ? 'border-primary/30 bg-primary/5'
          : 'border-border/60 bg-transparent'
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
            done
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          )}
          aria-hidden
        >
          {done ? <Check className="size-4" /> : icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              {done ? <span className="sr-only">Done. </span> : null}
              {title}
            </p>
            <p className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
              {reward}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {detail}
          </p>
        </div>
      </div>
      {action ? <div className="shrink-0 sm:self-center">{action}</div> : null}
    </li>
  );
}
