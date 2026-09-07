import { createFileRoute } from '@tanstack/react-router';
import { OgImageLinkedIn } from '@/ui/marketing/og-image-linkedin';

export const Route = createFileRoute('/meta/og-linkedin')({
  component: OgImageLinkedIn,
});
