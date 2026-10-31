import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  ShieldCheck,
  FileCode2,
  KeyRound,
  ClipboardList,
  Bell,
  Search,
  Zap,
  CreditCard,
} from 'lucide-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useI18n } from '../../i18n/context';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export const AppSidebar: React.FC = () => {
  const { t } = useI18n();
  const { state, toggleSidebar } = useSidebar();
  const [searchQuery, setSearchQuery] = useState('');

  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const isCollapsed = state === 'collapsed';

  const matchesSearch = (label: string) => {
    if (!searchQuery.trim()) return true;
    return label.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const navItems = [
    {
      to: '/',
      label: t.sidebar.overview,
      icon: <LayoutDashboard className="size-4 shrink-0" />,
    },
    {
      to: '/quickstart',
      label: 'Quickstart & SDKs',
      icon: <Zap className="size-4 shrink-0 text-amber-400" />,
    },
    {
      to: '/users',
      label: t.sidebar.users,
      icon: <Users className="size-4 shrink-0" />,
    },
    {
      to: '/organizations',
      label: t.sidebar.organizations,
      icon: <Building2 className="size-4 shrink-0" />,
    },
    {
      to: '/permissions',
      label: 'Permissões & RBAC',
      icon: <ShieldCheck className="size-4 shrink-0 text-indigo-400" />,
    },
    {
      to: '/billing',
      label: 'Billing & Planos',
      icon: <CreditCard className="size-4 shrink-0 text-emerald-400" />,
    },
    {
      to: '/sessions',
      label: t.sidebar.sessions,
      icon: <ShieldCheck className="size-4 shrink-0" />,
    },
    {
      to: '/api-keys',
      label: t.sidebar.apiKeys,
      icon: <KeyRound className="size-4 shrink-0" />,
    },
    {
      to: '/audit-logs',
      label: t.sidebar.auditLogs,
      icon: <ClipboardList className="size-4 shrink-0" />,
    },
    {
      to: '/webhooks',
      label: t.sidebar.webhooks,
      icon: <Bell className="size-4 shrink-0" />,
    },
  ];

  const devItems = [
    {
      href: '/docs',
      label: t.sidebar.swaggerUi,
      icon: <FileCode2 className="size-4 shrink-0 text-emerald-500" />,
    },
    {
      href: '/.well-known/jwks.json',
      label: t.sidebar.jwks,
      icon: <KeyRound className="size-4 shrink-0 text-amber-500" />,
    },
  ];

  return (
    <Sidebar collapsible="icon" className="select-none">
      {/* 1. Barra de Busca Rápida Estilo Cloudflare (Ctrl + K) */}
      <SidebarHeader className="border-b border-border/50 pb-2">
        {!isCollapsed ? (
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.sidebar.quickSearch}
              className="w-full h-8 pl-8 pr-12 rounded-md bg-muted/50 border border-border/80 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            />
            <kbd className="absolute right-2 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-card border border-border/70 rounded">
              Ctrl K
            </kbd>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground mx-auto transition-colors"
                >
                  <Search className="size-4" />
                </button>
              }
            />
            <TooltipContent side="right">{t.sidebar.quickSearch}</TooltipContent>
          </Tooltip>
        )}
      </SidebarHeader>

      {/* 2. Conteúdo da Sidebar: Grupos de Navegação */}
      <SidebarContent className="px-2 py-3 space-y-4">
        {/* Grupo 1: Gestão Principal */}
        <SidebarGroup>
          {!isCollapsed && (
            <SidebarGroupLabel className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase px-2 mb-1">
              {t.sidebar.management}
            </SidebarGroupLabel>
          )}
          <SidebarMenu>
            {navItems
              .filter((item) => matchesSearch(item.label))
              .map((item) => {
                const isActive = currentPath === item.to;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        to={item.to}
                        className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-indigo-500/10 text-indigo-500 font-semibold border border-indigo-500/20'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                        }`}
                      >
                        {item.icon}
                        {!isCollapsed && <span>{item.label}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Grupo 2: Endpoints de Desenvolvedor */}
        <SidebarGroup>
          {!isCollapsed && (
            <SidebarGroupLabel className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase px-2 mb-1">
              {t.sidebar.developer}
            </SidebarGroupLabel>
          )}
          <SidebarMenu>
            {devItems
              .filter((item) => matchesSearch(item.label))
              .map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                    >
                      {item.icon}
                      {!isCollapsed && <span>{item.label}</span>}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};
