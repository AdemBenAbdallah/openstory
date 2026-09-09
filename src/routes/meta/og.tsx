import { createFileRoute } from '@tanstack/react-router';
import { OgImage } from '@/ui/marketing/og-image';

export const Route = createFileRoute('/meta/og')({
  component: OgImage,
});
