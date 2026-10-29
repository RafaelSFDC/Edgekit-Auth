import React from 'react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '../lib/utils';
import { toast } from 'sonner';
import {
  ShieldCheck,
  Laptop,
  Smartphone,
  Globe,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle,
} from 'lucide-react';

export const SessionsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  // Current session info
  const { data: sessionData } = authClient.useSession();

  // List active sessions for the current user
  const { data: sessionsData, isLoading } = useQuery({
    queryKey: ['user', 'sessions'],
    queryFn: async () => {
      const res = await authClient.listSessions();
      return res.data || [];
    },
  });

  const sessions: any[] = sessionsData || [];

  // Revoke single session mutation
  const revokeSessionMutation = useMutation({
    mutationFn: async (token: string) => {
      return authClient.revokeSession({ token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'sessions'] });
      toast.success('Sessão revogada com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao revogar sessão.');
    },
  });

  // Revoke other sessions mutation
  const revokeOthersMutation = useMutation({
    mutationFn: async () => {
      return authClient.revokeOtherSessions();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'sessions'] });
      toast.success('Todas as outras sessões ativas foram desconectadas.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao desconectar outras sessões.');
    },
  });

  return (
    <PageLayout>
      <PageHeader
        title={t.sessions.title}
        description={t.sessions.subtitle}
        actions={
          sessions.length > 1 ? (
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

      <Card>
        <CardHeader className="pb-3 border-b border-border/60">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-500" />
            <span>Dispositivos Conectados ({sessions.length})</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Sessões criptografadas armazenadas com tokens revogáveis sob demanda
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin text-indigo-500" />
              <span>{t.common.loading}</span>
            </div>
          ) : sessions.length === 0 ? (
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
                  {sessions.map((s) => {
                    const isCurrent = s.token === sessionData?.session?.token;
                    const ua = s.userAgent || '';
                    const isMobile = /mobile|android|iphone/i.test(ua);

                    return (
                      <TableRow key={s.id || s.token}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                              {isMobile ? (
                                <Smartphone className="size-4" />
                              ) : (
                                <Laptop className="size-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground truncate">
                                  {ua.slice(0, 40) || 'Cliente Desconhecido'}
                                </span>
                                {isCurrent && (
                                  <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 px-1.5 py-0">
                                    <CheckCircle className="size-2.5 mr-1" />
                                    Esta Sessão
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground font-mono truncate">
                                Token: {s.token ? `${s.token.slice(0, 12)}...` : 'N/A'}
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
    </PageLayout>
  );
};
