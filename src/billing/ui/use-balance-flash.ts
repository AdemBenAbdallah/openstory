/**
 * Balance Flash Hook
 * Shows the balance badge for 5 seconds after credits are added.
 *
 * Two trigger mechanisms:
 * - prepareBalanceFlash(): call before Stripe redirect. Sets a 'pending' marker
 *   that converts to a live timer when the page loads back with ?success=true.
 * - triggerBalanceFlash(): call for same-page events (gift code redemption).
 *   Sets timestamp + dispatches event so the hook reacts immediately.
 * - clearBalanceFlash(): call on canceled checkout to remove the pending marker.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const FLASH_KEY = 'openstory:balance-flash';
const FLASH_EVENT = 'openstory:balance-flash';
const FLASH_DURATION = 5000;

/** Call before Stripe redirect — marker survives the round-trip. */
export function prepareBalanceFlash() {
  sessionStorage.setItem(FLASH_KEY, 'pending');
}

/** Call for same-page credit additions (gift codes). */
export function triggerBalanceFlash() {
  sessionStorage.setItem(FLASH_KEY, String(Date.now()));
  window.dispatchEvent(new Event(FLASH_EVENT));
}

/** Call when checkout is canceled to clear the pending marker. */
export function clearBalanceFlash() {
  sessionStorage.removeItem(FLASH_KEY);
}

export function useBalanceFlash() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const startFlash = useCallback((durationMs: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(true);
    timerRef.current = setTimeout(() => {
      sessionStorage.removeItem(FLASH_KEY);
      setVisible(false);
    }, durationMs);
  }, []);

  // On mount: check sessionStorage for pending or active flash
  useEffect(() => {
    const stored = sessionStorage.getItem(FLASH_KEY);
    if (stored === null) return;

    if (stored === 'pending') {
      // Returned from Stripe — start the 5s timer now
      sessionStorage.setItem(FLASH_KEY, String(Date.now()));
      startFlash(FLASH_DURATION);
      return;
    }

    // Active timestamp — show for remaining time
    const remaining = FLASH_DURATION - (Date.now() - parseInt(stored, 10));
    if (remaining > 0) {
      startFlash(remaining);
    } else {
      sessionStorage.removeItem(FLASH_KEY);
    }
  }, [startFlash]);

  // Listen for same-page triggers (gift codes)
  useEffect(() => {
    const handler = () => startFlash(FLASH_DURATION);
    window.addEventListener(FLASH_EVENT, handler);
    return () => window.removeEventListener(FLASH_EVENT, handler);
  }, [startFlash]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { isFlashing: visible };
}
