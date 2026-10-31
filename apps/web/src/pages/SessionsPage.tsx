import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient } from '../lib/auth-client';
import { useI18n } from '../i18n/context';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '../lib/utils';
import { toast } from 'sonner';
import {
  ShieldCheck,
  Laptop,
  Smartphone,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle,
  Search,
  Zap,
} from 'lucide-react';

export const SessionsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [now] = useState(() => Date.now());

  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [selectedUserForAudit, setSelectedUserForAudit] = useState<any | null>(null);

  // Current session info
  const { data: sessionData } = authClient.useSession();

  // List active sessions for the current admin user
  const { data: sessionsData, isLoading: isLoadingMySessions } = useQuery({
    queryKey: ['user', 'sessions'],
    queryFn: async () => {
      const res = await authClient.listSessions();
      return res.data || [];
    },
  });

  const mySessions: any[] = sessionsData || [];

  // Search users for audit tab
  const { data: searchUsersData, isLoading: _isLoadingSearchUsers } = useQuery({
    queryKey: ['admin', 'users-search-session', userSearchTerm],
    queryFn: async () => {
      if (!userSearchTerm.trim()) return [];
      const res = await (authClient.admin as any).listUsers({
        query: {
          searchValue: userSearchTerm.trim(),
          limit: 10,
        },
      });
      return res.data?.users || [];
    },
    enabled: Boolean(userSearchTerm.trim()),
  });

  const foundUsers: any[] = searchUsersData || [];

  // List sessions of the audited user
  const {
    data: auditedUserSessionsData,
    isLoading: isLoadingAuditedSessions,
    refetch: refetchAuditedSessions,
  } = useQuery({
    queryKey: ['admin', 'user-sessions-audit', selectedUserForAudit?.id],
    queryFn: async () => {
      if (!selectedUserForAudit?.id) return [];
      const res = await (authClient.admin as any).listUserSessions({
        userId: selectedUserForAudit.id,
      });
      return res.data?.sessions || res.data || [];
    },
    enabled: Boolean(selectedUserForAudit?.id),
  });

  const auditedSessions: any[] = Array.isArray(auditedUserSessionsData) ? auditedUserSessionsData : [];

  // Revoke single session mutation (own)
  const revokeSessionMutation = useMutation({
    mutationFn: async (token: string) => {
      return authClient.revokeSession({ token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'sessions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Sessão revogada com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao revogar sessão.');
    },
  });

  // Revoke other sessions mutation (own)
  const revokeOthersMutation = useMutation({
    mutationFn: async () => {
      return authClient.revokeOtherSessions();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'sessions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Todas as outras sessões ativas foram desconectadas.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao desconectar outras sessões.');
    },
  });

  // Revoke target user session (admin)
  const revokeTargetUserSessionMutation = useMutation({
    mutationFn: async (sessionToken: string) => {
      return (authClient.admin as any).revokeUserSession({ sessionToken });
    },
    onSuccess: () => {
      refetchAuditedSessions();
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Sessão do usuário desconectada.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao desconectar sessão do usuário.');
    },
  });

  // Revoke all sessions of target user (admin)
  const revokeAllTargetSessionsMutation = useMutation({
    mutationFn: async (userId: string) => {
      return (authClient.admin as any).revokeUserSessions({ userId });
    },
    onSuccess: () => {
      refetchAuditedSessions();
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Todas as sessões do usuário foram desconectadas.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao desconectar sessões.');
    },
  });

  return (
    <PageLayout>
      <PageHeader
        title={t.sessions.title}
        description={t.sessions.subtitle}
        actions={
          mySessions.length > 1 ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm(t.sessions.revokeOthersConfirm)) {
                  revokeOthersMutation.mutate();
                }
              }}
              disabled={revokeOthersMutation.isPending}
              className="gap-2 text-xs font-semibold"
            >
              {revokeOthersMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <AlertTriangle className="size-3.5" />
              )}
              <span>{t.sessions.revokeOthers}</span>
            </Button>
          ) : undefined
        }
      />

      {/* Banner de Arquitetura de Sessão no Edge */}
      <Card className="border-indigo-500/20 bg-indigo-500/5">
        <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <Zap className="size-4" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Gerenciamento de Sessões Híbrido & Edge Caching</p>
              <p className="text-muted-foreground text-[11px]">
                Tokens de sessão são validados via cookies criptografados rápidos (5 min) e persistidos no Cloudflare D1. Revogações têm efeito imediato.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] text-indigo-400 border-indigo-500/30 shrink-0">
            D1 + Cookie Cache
          </Badge>
        </CardContent>
      </Card>

      {/* Tabs: Minhas Sessões vs Auditoria de Usuários */}
      <Tabs defaultValue="my-sessions" className="w-full">
        <TabsList className="grid grid-cols-2 max-w-md">
          <TabsTrigger value="my-sessions" className="text-xs">
            Minhas Sessões ({mySessions.length})
          </TabsTrigger>
          <TabsTrigger value="user-audit" className="text-xs">
            Auditar Sessões de Usuário
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Minhas Sessões */}
        <TabsContent value="my-sessions" className="pt-4">
          <Card>
            <CardHeader className="pb-3 border-b border-border/60">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-500" />
                <span>Dispositivos Conectados ({mySessions.length})</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Sessões ativas vinculadas à sua conta administrativa atual
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
              {isLoadingMySessions ? (
                <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin text-indigo-500" />
                  <span>{t.common.loading}</span>
                </div>
              ) : mySessions.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground">
                  Nenhuma sessão ativa encontrada.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t.sessions.table.device}</TableHead>
                        <TableHead className="text-xs">{t.sessions.table.ip}</TableHead>
                        <TableHead className="text-xs">{t.sessions.table.expires}</TableHead>
                        <TableHead className="text-xs text-right">{t.sessions.table.actions}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mySessions.map((s) => {
                        const isCurrent = s.token === sessionData?.session?.token;
                        const ua = s.userAgent || '';
                        const isMobile = /mobile|android|iphone/i.test(ua);

                        return (
                          <TableRow key={s.id || s.token}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="size-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                                  {isMobile ? <Smartphone className="size-4" /> : <Laptop className="size-4" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-foreground truncate max-w-xs">
                                      {ua.slice(0, 45) || 'Cliente Desconhecido'}
                                    </span>
                                    {isCurrent && (
                                      <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 px-1.5 py-0">
                                        <CheckCircle className="size-2.5 mr-1" />
                                        Esta Sessão
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                                    Token: {s.token ? `${s.token.slice(0, 14)}...` : 'N/A'}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-[11px] font-mono text-muted-foreground">
                              {s.ipAddress || '127.0.0.1'}
                            </TableCell>
                            <TableCell className="text-[11px] font-mono text-muted-foreground">
                              {formatDate(s.expiresAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              {!isCurrent && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => revokeSessionMutation.mutate(s.token)}
                                  disabled={revokeSessionMutation.isPending}
                                  title={t.sessions.revokeSession}
                                  className="size-7 text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Auditoria de Sessões por Usuário */}
        <TabsContent value="user-audit" className="pt-4 space-y-4">
          <Card>
            <CardHeader className="p-4 border-b border-border/60">
              <div className="space-y-1">
                <CardTitle className="text-sm font-semibold">Localizar e Auditar Sessões de Usuário</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Busque qualquer usuário da base D1 para visualizar e desconectar seus dispositivos ativos
                </CardDescription>
              </div>
              <div className="relative max-w-sm mt-3">
                <Search className="size-4 text-muted-foreground absolute left-3 top-2.5" />
                <Input
                  type="text"
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  placeholder="Digite o nome ou email do usuário..."
                  className="pl-9 text-xs h-9"
                />
              </div>

              {/* Lista de usuários encontrados na busca */}
              {userSearchTerm.trim() && foundUsers.length > 0 && (
                <div className="mt-2 divide-y divide-border/60 border border-border/80 rounded-lg max-h-48 overflow-y-auto bg-muted/20">
                  {foundUsers.map((u) => {
                    const isSelected = selectedUserForAudit?.id === u.id;
                    return (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() => setSelectedUserForAudit(u)}
                        className={`w-full p-2.5 flex items-center justify-between text-xs cursor-pointer hover:bg-muted/50 transition-colors ${
                          isSelected ? 'bg-indigo-500/10 font-semibold' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-foreground">{u.name || 'Sem nome'}</span>
                          <span className="text-muted-foreground font-mono text-[11px]">({u.email})</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {u.role || 'user'}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardHeader>

            <CardContent className="p-4">
              {!selectedUserForAudit ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Selecione um usuário acima para inspecionar seus dispositivos e sessões conectadas.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs uppercase">
                        {selectedUserForAudit.name?.[0] || selectedUserForAudit.email?.[0] || 'U'}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-foreground">
                          {selectedUserForAudit.name || 'Sem nome'}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground">
                          {selectedUserForAudit.email}
                        </div>
                      </div>
                    </div>
                    {auditedSessions.length > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Desconectar todas as ${auditedSessions.length} sessões de ${selectedUserForAudit.email}?`)) {
                            revokeAllTargetSessionsMutation.mutate(selectedUserForAudit.id);
                          }
                        }}
                        disabled={revokeAllTargetSessionsMutation.isPending}
                        className="text-xs h-7 gap-1"
                      >
                        <Trash2 className="size-3" />
                        <span>Desconectar Todas ({auditedSessions.length})</span>
                      </Button>
                    )}
                  </div>

                  {isLoadingAuditedSessions ? (
                    <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin text-indigo-500" />
                      <span>Carregando sessões...</span>
                    </div>
                  ) : auditedSessions.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                      Nenhuma sessão ativa encontrada para este usuário.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {auditedSessions.map((s: any) => {
                        const isExpired = new Date(s.expiresAt).getTime() < now;
                        const ua = s.userAgent || '';
                        const isMobile = /mobile|android|iphone/i.test(ua);

                        return (
                          <div
                            key={s.id || s.token}
                            className="p-3 rounded-lg border border-border/80 bg-muted/20 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="size-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                                {isMobile ? <Smartphone className="size-4" /> : <Laptop className="size-4" />}
                              </div>
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-foreground truncate max-w-xs">
                                    {ua || 'Navegador / Cliente'}
                                  </span>
                                  {isExpired ? (
                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Expirada</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 px-1.5 py-0">Ativa</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
                                  <span>IP: {s.ipAddress || 'Não registrado'}</span>
                                  <span>Expira: {formatDate(s.expiresAt)}</span>
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeTargetUserSessionMutation.mutate(s.token)}
                              disabled={revokeTargetUserSessionMutation.isPending}
                              className="text-destructive hover:bg-destructive/10 text-xs h-7 shrink-0"
                            >
                              Desconectar
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
};
