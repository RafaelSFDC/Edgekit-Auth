import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { authClient } from '../lib/auth-client';
import { useI18n } from '../i18n/context';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '../lib/utils';
import {
  Users,
  Building2,
  ShieldCheck,
  ArrowUpRight,
  FileCode2,
  KeyRound,
  CheckCircle2,
  Sparkles,
  Zap,
} from 'lucide-react';

export const OverviewPage: React.FC = () => {
  const { t } = useI18n();

  // Query users count and overview
  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['admin', 'users', { limit: 5 }],
    queryFn: async () => {
      const res = await (authClient.admin as any).listUsers({
        query: { limit: 5 },
      });
      return res.data;
    },
  });

  // Query health endpoint
  const { data: healthData } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/health');
      return res.json();
    },
  });

  const totalUsers = usersData?.total ?? usersData?.users?.length ?? 0;
  const recentUsers: any[] = usersData?.users?.slice(0, 5) || [];

  return (
    <PageLayout>
      <PageHeader
        title={t.overview.title}
        description={t.overview.subtitle}
      />

      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <Card className="hover:border-indigo-500/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {t.overview.totalUsers}
              </span>
              <div className="size-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <Users className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-foreground">
                {isLoadingUsers ? '...' : totalUsers}
              </span>
              <span className="text-xs text-emerald-500 font-medium">{t.overview.d1Accounts}</span>
            </div>
            <div className="mt-4 pt-3 border-t border-border/60">
              <Link
                to="/users"
                className="text-xs text-indigo-500 hover:text-indigo-400 font-medium flex items-center gap-1 group"
              >
                <span>{t.overview.manageUsers}</span>
                <ArrowUpRight className="size-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Multi-Tenancy */}
        <Card className="hover:border-indigo-500/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {t.overview.multiTenancy}
              </span>
              <div className="size-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
                <Building2 className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-foreground">RBAC</span>
              <span className="text-xs text-muted-foreground font-medium">{t.overview.multiTenancyDesc}</span>
            </div>
            <div className="mt-4 pt-3 border-t border-border/60">
              <Link
                to="/organizations"
                className="text-xs text-indigo-500 hover:text-indigo-400 font-medium flex items-center gap-1 group"
              >
                <span>{t.overview.manageOrgs}</span>
                <ArrowUpRight className="size-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Sessions */}
        <Card className="hover:border-indigo-500/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {t.overview.activeSessions}
              </span>
              <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <ShieldCheck className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-foreground">Online</span>
              <span className="text-xs text-emerald-500 font-medium">{t.overview.activeTokens}</span>
            </div>
            <div className="mt-4 pt-3 border-t border-border/60">
              <Link
                to="/sessions"
                className="text-xs text-indigo-500 hover:text-indigo-400 font-medium flex items-center gap-1 group"
              >
                <span>{t.overview.auditSessions}</span>
                <ArrowUpRight className="size-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Engine Health */}
        <Card className="hover:border-indigo-500/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {t.overview.edgeEngine}
              </span>
              <div className="size-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Zap className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tracking-tight text-emerald-500 uppercase">
                {healthData?.status || 'Ativo'}
              </span>
              <span className="text-xs text-muted-foreground font-mono">D1 Edge</span>
            </div>
            <div className="mt-4 pt-3 border-t border-border/60">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{t.overview.edgeEngineDesc}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Seção Inferior: Tabela de Usuários Recentes e Atalhos de Desenvolvedor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Usuários Recentes */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-semibold">{t.overview.recentUsers}</CardTitle>
              <CardDescription className="text-xs">Últimos registros efetuados no banco SQLite</CardDescription>
            </div>
            <Link to="/users">
              <Button variant="outline" size="sm" className="text-xs">
                {t.common.all}
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentUsers.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                {isLoadingUsers ? t.common.loading : t.overview.noUsers}
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {recentUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs uppercase">
                        {u.name?.[0] || u.email?.[0] || 'U'}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-foreground">{u.name || 'Sem nome'}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{u.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] px-2 py-0">
                        {u.role || 'user'}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline">
                        {formatDate(u.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Atalhos para Desenvolvedor */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">APIs & Especificações</CardTitle>
            <CardDescription className="text-xs">Acesse os endpoints públicos e documentação interativa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-muted/30 hover:bg-muted/70 hover:border-emerald-500/40 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <FileCode2 className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground group-hover:text-emerald-500 transition-colors">
                    Swagger UI (/docs)
                  </div>
                  <div className="text-[10px] text-muted-foreground">OpenAPI 3.1 & Better Auth Schemas</div>
                </div>
              </div>
              <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
            </a>

            <a
              href="/.well-known/jwks.json"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-muted/30 hover:bg-muted/70 hover:border-amber-500/40 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <KeyRound className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground group-hover:text-amber-500 transition-colors">
                    JWKS Endpoint
                  </div>
                  <div className="text-[10px] text-muted-foreground">Chaves públicas RSA/Ed25519 para verificação</div>
                </div>
              </div>
              <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-amber-500 transition-colors" />
            </a>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
};
