import React, { useState } from 'react';
import {
  Globe,
  Sun,
  Moon,
  LogOut,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { EdgekitLogo } from '../common/EdgekitLogo';
import { useI18n } from '../../i18n/context';
import { useTheme } from '../../theme/context';
import { useAuth } from '../../context/auth-context';
import { authClient } from '../../lib/auth-client';
import { useSidebar, SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { toast } from 'sonner';

export const TopHeader: React.FC = () => {
  const { toggleLocale, t } = useI18n();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { user, isImpersonating, signOut } = useAuth();
  const { state } = useSidebar();
  const [isStoppingImpersonation, setIsStoppingImpersonation] = useState(false);

  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const handleStopImpersonating = async () => {
    setIsStoppingImpersonation(true);
    try {
      await (authClient.admin as any).stopImpersonating();
      toast.success('Personificação encerrada.');
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao sair da personificação.');
      setIsStoppingImpersonation(false);
    }
  };

  const getBreadcrumbs = () => {
    switch (pathname) {
      case '/users':
        return t.breadcrumbs.users;
      case '/organizations':
        return t.breadcrumbs.organizations;
      case '/sessions':
        return t.breadcrumbs.sessions;
      case '/api-keys':
        return t.breadcrumbs.apiKeys;
      case '/audit-logs':
        return t.breadcrumbs.auditLogs;
      case '/webhooks':
        return t.breadcrumbs.webhooks;
      case '/':
      default:
        return t.breadcrumbs.overview;
    }
  };

  const currentPage = getBreadcrumbs();

  return (
    <header className="sticky top-0 z-40 flex h-12 w-full border-b border-border bg-card/90 backdrop-blur-md select-none">
      {/* 1. Célula Superior Esquerda (Alinhada com a largura da Sidebar) */}
      <div
        className={cn(
          'flex h-full items-center border-r border-border bg-card transition-[width] duration-200 ease-in-out shrink-0',
          state === 'collapsed'
            ? 'w-[var(--sidebar-width-icon)] justify-center px-0'
            : 'w-full lg:w-[var(--sidebar-width)] justify-between px-3'
        )}
      >
        <Link to="/" className="flex items-center gap-2 overflow-hidden outline-hidden">
          {/* Logo oficial do Edgekit Auth */}
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 shadow-xs">
            <EdgekitLogo size={20} module="auth" />
          </div>

          {state !== 'collapsed' && (
            <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <span className="font-bold tracking-tight text-foreground text-sm">Edgekit</span>
              <span className="semibold text-indigo-500 text-sm">Auth</span>
              <span className="ml-1 rounded px-1.5 py-0.2 text-[10px] font-mono font-medium bg-muted text-muted-foreground border border-border">
                v1.0
              </span>
            </div>
          )}
        </Link>

        {/* Mobile toggle button */}
        <div className="lg:hidden">
          <SidebarTrigger />
        </div>
      </div>

      {/* 2. Barra Superior Direita com Breadcrumbs e Ações */}
      <div className="flex flex-1 items-center justify-between px-4 min-w-0">
        {/* Breadcrumb de navegação da rota ativa */}
        <div className="flex items-center gap-2 min-w-0">
          <Breadcrumb className="hidden sm:block">
            <BreadcrumbList>
              <BreadcrumbItem>
                <Link to="/" className="text-xs hover:text-foreground text-muted-foreground transition-colors">
                  Edgekit Auth
                </Link>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-xs font-semibold text-foreground">
                  {currentPage}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Indicadores de Status e Controles Globais */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Worker Edge Status */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-500 font-medium">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t.topHeader.online}</span>
          </div>

          {/* Impersonation Indicator and Exit Button if active */}
          {isImpersonating && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStopImpersonating}
              disabled={isStoppingImpersonation}
              className="h-7 px-2.5 gap-1.5 text-[11px] font-semibold text-amber-500 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
            >
              {isStoppingImpersonation ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
              <span>{t.topHeader.stopImpersonating}</span>
            </Button>
          )}

          {/* D1 SQLite Badge */}
          <Badge variant="outline" className="hidden lg:inline-flex text-[10px] font-mono px-2 py-0.5">
            {t.topHeader.d1Sqlite}
          </Badge>

          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

          {/* Idioma PT-BR / EN */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLocale}
            className="size-8 text-muted-foreground hover:text-foreground"
            title={t.topHeader.languageTooltip}
          >
            <Globe className="size-4" />
          </Button>

          {/* Tema Claro / Escuro */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="size-8 text-muted-foreground hover:text-foreground"
            title={t.topHeader.themeTooltip}
          >
            {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          {/* Dropdown do Usuário / Logout */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-full hover:bg-muted/60 transition-colors border border-transparent hover:border-border/60 outline-hidden cursor-pointer"
                >
                  <div className="size-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold text-xs uppercase">
                    {user?.name?.[0] || user?.email?.[0] || 'A'}
                  </div>
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-xs font-semibold leading-none text-foreground">{user?.name || 'Administrador'}</p>
                    <p className="text-[11px] leading-none text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {isImpersonating && (
                <>
                  <DropdownMenuItem
                    onClick={handleStopImpersonating}
                    disabled={isStoppingImpersonation}
                    className="text-amber-500 focus:text-amber-500 focus:bg-amber-500/10 cursor-pointer text-xs font-medium"
                  >
                    <Sparkles className="mr-2 size-3.5" />
                    <span>{t.topHeader.stopImpersonating}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={signOut}
                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer text-xs font-medium"
              >
                <LogOut className="mr-2 size-3.5" />
                <span>{t.topHeader.signOut}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
