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
import { OverviewPage } from './pages/OverviewPage';
import { UsersPage } from './pages/UsersPage';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { SessionsPage } from './pages/SessionsPage';
import { useAuth } from './context/auth-context';
import { EdgekitLogo } from './components/common/EdgekitLogo';

/**
 * Componente Guardião da Dashboard:
 * Se o usuário não estiver autenticado ou não for admin, redireciona para /login.
 */
const DashboardGuard: React.FC = () => {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

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

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return <DashboardLayout />;
};

// 1. Rota raiz que renderiza o Outlet
const rootRoute = createRootRoute({
  component: Outlet,
});

// 2. Rota pública de Login (fora do DashboardLayout)
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
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

// 5. Montagem da Árvore de Rotas
const routeTree = rootRoute.addChildren([
  loginRoute,
  dashboardRoute.addChildren([
    indexRoute,
    usersRoute,
    organizationsRoute,
    sessionsRoute,
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
