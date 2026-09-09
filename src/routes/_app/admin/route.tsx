import { RouteErrorFallback } from '@/ui/error/route-error-fallback';
import { PageContainer } from '@/ui/layout/page-container';
import { isSystemAdminFn } from '@/billing/gift-tokens.fn';
import { requireSessionOrRedirect } from '@/platform/ui/auth/route-guards';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/admin')({
  beforeLoad: async ({ context: { queryClient }, location }) => {
    await requireSessionOrRedirect(queryClient, location.href);
    const { isAdmin } = await isSystemAdminFn();
    if (!isAdmin) {
      throw redirect({ to: '/sequences' });
    }
  },
  component: AdminLayout,
  staticData: { breadcrumb: { label: 'Admin', to: '/admin/usage' } },
  errorComponent: (props) => (
    <RouteErrorFallback {...props} heading="Admin error" />
  ),
});

function AdminLayout() {
  return (
    <PageContainer
      maxWidth="full"
      padding="compact"
      className="flex-1 flex flex-col overflow-hidden"
    >
      <Outlet />
    </PageContainer>
  );
}
