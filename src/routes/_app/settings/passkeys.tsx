/**
 * Passkey Management Page
 * Allows users to add, view, and delete passkeys
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { PasskeySettings } from '@/ui/settings/passkey-settings';

const searchSchema = z.object({
  setup: z.boolean().optional(),
});

export const Route = createFileRoute('/_app/settings/passkeys')({
  validateSearch: searchSchema,
  component: PasskeysPage,
  staticData: { breadcrumb: 'Passkeys' },
});

function PasskeysPage() {
  const { setup } = Route.useSearch();

  return <PasskeySettings isSetupFlow={setup} />;
}
