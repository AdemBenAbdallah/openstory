import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Hook to detect if the app has hydrated on the client.
 * Returns false during SSR and initial render, true after hydration.
 *
 * Use this to prevent interactions with elements that aren't ready yet,
 * avoiding the "button visible but not clickable" hydration issue.
 */
export function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true, // Client: always true after hydration
    () => false // Server: always false
  );
}
