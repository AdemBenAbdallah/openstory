import { DocsSidebar } from './docs-sidebar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/ui/sidebar';
import { UserSidebarFooter } from '@/ui/layout/user-sidebar-footer';
import { getDocsReturnUrl } from './docs-referrer';
import { useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export function DocsAppSidebar() {
  const router = useRouter();

  const handleBack = () => {
    const returnUrl = getDocsReturnUrl();
    void router.navigate({ href: returnUrl ?? '/' });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleBack} tooltip="Back">
              <ArrowLeft />
              <span>Back</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <DocsSidebar />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <UserSidebarFooter />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
