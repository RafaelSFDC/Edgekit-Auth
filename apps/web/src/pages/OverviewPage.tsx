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
  Fingerprint,
  ShieldAlert,
  Lock,
} from 'lucide-react';

export const OverviewPage: React.FC = () => {
  const { t } = useI18n();

  // Query users for recent users list
  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['admin', 'users', { limit: 5 }],
    queryFn: async () => {
      const res = await (authClient.admin as any).listUsers({
        query: { limit: 5 },
      });
      return res.data;
    },
  });

  // Query real-time aggregated stats from /api/admin/stats
  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) throw new Error('Falha ao carregar métricas');
      return res.json();
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

  const totalUsers = statsData?.totalUsers ?? (usersData?.total ?? usersData?.users?.length ?? 0);
  const totalOrgs = statsData?.totalOrganizations ?? 0;
  const totalMembers = statsData?.totalMembers ?? 0;
  const activeSessions = statsData?.activeSessions ?? 0;
  const passkeyUsers = statsData?.passkeyUsers ?? 0;
  const twoFactorUsers = statsData?.twoFactorUsers ?? 0;
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
                {isLoadingStats ? '...' : totalUsers}
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

        {/* Multi-Tenancy & Orgs */}
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
              <span className="text-3xl font-extrabold tracking-tight text-foreground">
                {isLoadingStats ? '...' : totalOrgs}
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                {totalMembers} {totalMembers === 1 ? 'membro' : 'membros'}
              </span>
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
              <span className="text-3xl font-extrabold tracking-tight text-foreground">
                {isLoadingStats ? '...' : activeSessions}
              </span>
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
              <span className="text-3xl font-extrabold tracking-tight text-foreground">
                {healthData?.latencyMs !== undefined ? `${healthData.latencyMs}ms` : 'Edge'}
              </span>
              <span className="text-xs text-muted-foreground font-medium">D1 Latency</span>
            </div>
            <div className="mt-4 pt-3 border-t border-border/60">
              <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{t.overview.edgeEngineDesc}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid Secundária: Métricas de Segurança e Credenciais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Fingerprint className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Passkeys FIDO2</p>
                <p className="text-lg font-bold text-foreground">{passkeyUsers} contas</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] text-purple-400 border-purple-500/30">
              Biometria
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Lock className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">2FA / TOTP Ativo</p>
                <p className="text-lg font-bold text-foreground">{twoFactorUsers} contas</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/30">
              MFA
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <ShieldAlert className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Contas Suspensas</p>
                <p className="text-lg font-bold text-foreground">{statsData?.totalBanned ?? 0} bloqueadas</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] text-rose-400 border-rose-500/30">
              Bloqueios
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Seção Inferior: Usuários Recentes e Recursos Rápidos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabela de Usuários Recentes (2 colunas) */}
        <Card className="lg:col-span-2">
          <CardHeader className="p-5 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">
                  {t.overview.recentUsers}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Últimos cadastros registrados no banco Cloudflare D1
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" render={<Link to="/users" />} className="text-xs gap-1">
                <span>Ver todos</span>
                <ArrowUpRight className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingUsers ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                {t.common.loading}
              </div>
            ) : recentUsers.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                {t.overview.noUsers}
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {recentUsers.map((u) => (
                  <div
                    key={u.id}
                    className="p-4 flex items-center justify-between hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                        {u.name?.[0] || u.email?.[0] || 'U'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">
                          {u.name || 'Sem nome'}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">
                          {u.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] px-2 py-0">
                        {u.role || 'user'}
                      </Badge>
                      <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline-block">
                        {formatDate(u.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card de Ferramentas de Desenvolvedor & Endpoints */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader className="p-5 border-b border-border/60">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="size-4 text-indigo-400" />
                <span>Integrações & Endpoints</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Acesse a documentação OpenAPI e chaves criptográficas
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-muted/30 hover:bg-muted/60 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="size-7 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <FileCode2 className="size-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Swagger UI (/docs)</div>
                    <div className="text-[10px] text-muted-foreground">Especificação interativa OpenAPI</div>
                  </div>
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </a>

              <a
                href="/.well-known/jwks.json"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-muted/30 hover:bg-muted/60 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="size-7 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <KeyRound className="size-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">JWKS Endpoint</div>
                    <div className="text-[10px] text-muted-foreground">Validação offline de tokens JWT</div>
                  </div>
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </a>

              <div className="pt-2">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Plugins Ativos no Worker
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">Email & Password</Badge>
                  <Badge variant="outline" className="text-[10px]">Passkeys (WebAuthn)</Badge>
                  <Badge variant="outline" className="text-[10px]">2FA (TOTP)</Badge>
                  <Badge variant="outline" className="text-[10px]">Magic Link</Badge>
                  <Badge variant="outline" className="text-[10px]">Organizations B2B</Badge>
                  <Badge variant="outline" className="text-[10px]">Impersonation</Badge>
                  <Badge variant="outline" className="text-[10px]">HMAC Webhooks</Badge>
                </div>
              </div>
            </CardContent>
          </div>

          <div className="p-4 border-t border-border/60 bg-muted/20 rounded-b-lg">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              <span>Edgekit Auth Core v1.0.0 operando no Edge</span>
            </div>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
};
