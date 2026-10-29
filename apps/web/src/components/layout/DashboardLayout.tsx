import React from 'react';
import { Outlet } from '@tanstack/react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TopHeader } from './TopHeader';
import { AppSidebar } from './AppSidebar';

export const DashboardLayout: React.FC = () => {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen w-full bg-background text-foreground flex flex-col">
        {/* Top Header estilo Cloudflare bipartido com Breadcrumbs integrados */}
        <TopHeader />

        {/* Corpo: Sidebar + Main Content Canvas */}
        <div className="flex flex-1 w-full">
          {/* Sidebar lateral */}
          <AppSidebar />

          {/* Canvas principal */}
          <main className="flex-1 min-w-0 flex flex-col bg-background/50">
            {/* Conteúdo da Rota Ativa */}
            <div className="flex-1 w-full min-w-0 p-4 sm:p-6 lg:p-8 flex flex-col">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
