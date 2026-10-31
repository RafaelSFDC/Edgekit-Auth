import React from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Navigate,
} from '@tanstack/react-router';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AcceptInvitationPage } from './pages/AcceptInvitationPage';
import { OverviewPage } from './pages/OverviewPage';
import { UsersPage } from './pages/UsersPage';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { SessionsPage } from './pages/SessionsPage';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { WebhooksPage } from './pages/WebhooksPage';
import { QuickstartPage } from './pages/QuickstartPage';
import { PermissionsPage } from './pages/PermissionsPage';
import { BillingPage } from './pages/BillingPage';
import { useAuth } from './context/auth-context';
import { EdgekitLogo } from './components/common/EdgekitLogo';

/**
 * Componente Guardião da Dashboard:
 * Se o usuário não estiver autenticado ou não for admin, redireciona para /login.
 */
const DashboardGuard: React.FC = () => {
  const { isAuthenticated, isSuperAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background text-foreground gap-3 select-none">
        <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 animate-pulse">
          <EdgekitLogo size={28} module="auth" />
        </div>
        <p className="text-xs text-muted-foreground animate-pulse font-medium">
          Carregando Edgekit Auth...
        </p>
      </div>
    );
  }

  if (!isAuthenticated || !isSuperAdmin) {
    return <Navigate to="/login" replace />;
  }

  return <DashboardLayout />;
};

// 1. Rota raiz que renderiza o Outlet
const rootRoute = createRootRoute({
  component: Outlet,
});

// 2. Rotas públicas (fora do DashboardLayout)
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  component: ResetPasswordPage,
});

const acceptInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accept-invitation',
  component: AcceptInvitationPage,
});

// 3. Layout Route da Dashboard protegida pelo DashboardGuard
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_dashboard',
  component: DashboardGuard,
});

// 4. Rotas filhas do Dashboard
const indexRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: OverviewPage,
});

const usersRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/users',
  component: UsersPage,
});

const organizationsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/organizations',
  component: OrganizationsPage,
});

const sessionsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/sessions',
  component: SessionsPage,
});

const apiKeysRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/api-keys',
  component: ApiKeysPage,
});

const auditLogsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/audit-logs',
  component: AuditLogsPage,
});

const webhooksRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/webhooks',
  component: WebhooksPage,
});

const quickstartRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/quickstart',
  component: QuickstartPage,
});

const permissionsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/permissions',
  component: PermissionsPage,
});

const billingRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/billing',
  component: BillingPage,
});

// 5. Montagem da Árvore de Rotas
const routeTree = rootRoute.addChildren([
  loginRoute,
  resetPasswordRoute,
  acceptInvitationRoute,
  dashboardRoute.addChildren([
    indexRoute,
    quickstartRoute,
    usersRoute,
    organizationsRoute,
    permissionsRoute,
    billingRoute,
    sessionsRoute,
    apiKeysRoute,
    auditLogsRoute,
    webhooksRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

// Registro de tipos para TanStack Router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
