import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '../lib/utils';
import {
  ShieldAlert,
  Search,
  Loader2,
  FileText,
  User,
  KeyRound,
  Building2,
  Globe,
  Clock,
  Sparkles,
} from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<any | null>(null);

  // Fetch audit logs from /api/admin/audit-logs
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit-logs', searchTerm],
    queryFn: async () => {
      const url = searchTerm
        ? `/api/admin/audit-logs?search=${encodeURIComponent(searchTerm)}`
        : '/api/admin/audit-logs';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao listar logs de auditoria');
      return res.json();
    },
  });

  const logs: any[] = data?.logs || [];

  const getActionBadge = (action: string) => {
    if (action.includes('banned') || action.includes('deleted') || action.includes('revoked')) {
      return (
        <Badge variant="destructive" className="text-[10px] font-mono">
          {action}
        </Badge>
      );
    }
    if (action.includes('created') || action.includes('promoted')) {
      return (
        <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 font-mono">
          {action}
        </Badge>
      );
    }
    if (action.includes('api_key')) {
      return (
        <Badge variant="outline" className="text-[10px] text-purple-400 border-purple-500/30 font-mono">
          {action}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-[10px] font-mono">
        {action}
      </Badge>
    );
  };

  return (
    <PageLayout>
      <PageHeader
        title="Trilha de Auditoria & Segurança"
        description="Registro cronológico imutável de eventos de autenticação e ações administrativas no Cloudflare D1"
      />

      <Card>
        {/* Barra de Filtro e Busca */}
        <CardHeader className="p-4 border-b border-border/60">
          <div className="relative max-w-sm">
            <Search className="size-4 text-muted-foreground absolute left-3 top-2.5" />
            <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por ação, email ou target ID..."
              className="pl-9 text-xs h-9"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin text-indigo-500" />
              <span>Carregando trilha de auditoria...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              Nenhum evento registrado no log de auditoria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Evento / Ação</TableHead>
                    <TableHead className="text-xs">Ator</TableHead>
                    <TableHead className="text-xs">Alvo (Target)</TableHead>
                    <TableHead className="text-xs">IP & Origem</TableHead>
                    <TableHead className="text-xs">Data e Hora</TableHead>
                    <TableHead className="text-xs text-right">Metadados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell>{getActionBadge(log.action)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] text-muted-foreground px-1 py-0 uppercase">
                            {log.actorType}
                          </Badge>
                          <span className="text-xs font-medium text-foreground truncate max-w-xs">
                            {log.actorEmail || log.actorId || 'Sistema'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-mono text-muted-foreground">
                          {log.targetType ? `${log.targetType}: ` : ''}
                          <span className="text-foreground">{log.targetId ? `${log.targetId.slice(0, 16)}...` : '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px] font-mono text-muted-foreground">
                        {log.ipAddress || '127.0.0.1'}
                      </TableCell>
                      <TableCell className="text-[11px] font-mono text-muted-foreground">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {log.metadata ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLogForDetails(log)}
                            className="text-xs h-7 gap-1 text-indigo-400 hover:text-indigo-300"
                          >
                            <FileText className="size-3" />
                            <span>Ver JSON</span>
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: Detalhes do JSON de Auditoria */}
      <Dialog open={Boolean(selectedLogForDetails)} onOpenChange={(open) => !open && setSelectedLogForDetails(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <FileText className="size-4 text-indigo-400" />
              <span>Metadados do Evento</span>
            </DialogTitle>
            <DialogDescription className="text-xs font-mono">
              {selectedLogForDetails?.action} — ID: {selectedLogForDetails?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedLogForDetails && (
            <div className="space-y-3 mt-2">
              <pre className="p-3 rounded-lg border border-border bg-muted/40 font-mono text-xs overflow-x-auto text-foreground max-h-60">
                {JSON.stringify(JSON.parse(selectedLogForDetails.metadata || '{}'), null, 2)}
              </pre>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button size="sm" onClick={() => setSelectedLogForDetails(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
};
