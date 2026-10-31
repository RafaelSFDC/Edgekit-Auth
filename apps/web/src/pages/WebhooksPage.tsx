import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Bell,
  Send,
  CheckCircle2,
  Loader2,
  Lock,
  Globe,
  FileCode2,
  Copy,
  Check,
} from 'lucide-react';

export const WebhooksPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // 1. Fetch Webhook configuration status
  const { data: infoData, isLoading: _isLoadingInfo } = useQuery({
    queryKey: ['admin', 'webhooks-info'],
    queryFn: async () => {
      const res = await fetch('/api/admin/webhooks/info');
      if (!res.ok) throw new Error('Falha ao carregar status do webhook');
      return res.json();
    },
  });

  // 2. Fetch Webhook delivery logs from audit trail
  const { data: logsData, isLoading: isLoadingLogs } = useQuery({
    queryKey: ['admin', 'webhook-logs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/audit-logs?search=webhook');
      if (!res.ok) throw new Error('Falha ao carregar histórico de webhooks');
      return res.json();
    },
  });

  const webhookLogs: any[] = logsData?.logs || [];

  // Mutation to send test ping
  const testWebhookMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/webhooks/test', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Falha ao testar webhook');
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'webhook-logs'] });
      if (data.success) {
        toast.success(`Ping recebido com sucesso pelo receptor (HTTP ${data.status} em ${data.latencyMs}ms)!`);
      } else {
        toast.warning(`Receptor respondeu com erro (HTTP ${data.status} em ${data.latencyMs}ms): ${data.error || 'Erro'}`);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao enviar webhook de teste.');
    },
  });

  const verificationCodeSnippet = `// Exemplo de Validação em Node.js / Edge
import crypto from "node:crypto";

export function verifyEdgekitWebhook(secret: string, rawBody: string, signature: string): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const expected = hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}`;

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(verificationCodeSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
    toast.success('Código de verificação copiado.');
  };

  return (
    <PageLayout>
      <PageHeader
        title="Webhooks & Eventos em Tempo Real"
        description="Notificações HTTP assinadas enviadas aos seus servidores nos eventos do ciclo de vida de autenticação"
        actions={
          <Button
            onClick={() => testWebhookMutation.mutate()}
            disabled={!infoData?.configured || testWebhookMutation.isPending}
            className="gap-2 text-xs font-semibold"
          >
            {testWebhookMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            <span>Disparar Ping de Teste</span>
          </Button>
        }
      />

      {/* Grid de Configuração & Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* URL do Receptor */}
        <Card className="md:col-span-2">
          <CardHeader className="p-4 border-b border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-2">
                <Globe className="size-4 text-indigo-400" />
                <span>Endpoint de Destino (WEBHOOK_URL)</span>
              </span>
              {infoData?.configured ? (
                <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                  <CheckCircle2 className="size-2.5 mr-1" />
                  Configurado
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px]">
                  Não configurado
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            <div className="p-2.5 rounded-lg border border-border bg-muted/30 font-mono text-xs break-all text-foreground">
              {infoData?.url || 'Defina WEBHOOK_URL no .env ou nas variáveis do Cloudflare Worker'}
            </div>
            <p className="text-[11px] text-muted-foreground">
              O Worker realiza chamadas HTTP POST imediatas enviando payloads JSON estruturados para esta URL a cada evento disparado.
            </p>
          </CardContent>
        </Card>

        {/* Assinatura Criptográfica */}
        <Card>
          <CardHeader className="p-4 border-b border-border/60">
            <span className="text-xs font-semibold text-foreground flex items-center gap-2">
              <Lock className="size-4 text-emerald-400" />
              <span>Assinatura HMAC</span>
            </span>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Segredo HMAC-SHA256:</span>
              {infoData?.hasSecret ? (
                <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                  Ativo
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  Inativo
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cabeçalho <code className="font-mono text-foreground font-semibold">X-Edgekit-Signature</code> incluído em todas as requisições para verificação de autenticidade.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Histórico Recente de Disparos */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/60">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bell className="size-4 text-indigo-400" />
            <span>Histórico de Entregas e Disparos</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Registro de eventos enviados e status retornado pelo servidor receptor
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {isLoadingLogs ? (
            <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin text-indigo-500" />
              <span>Carregando histórico de webhooks...</span>
            </div>
          ) : webhookLogs.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              Nenhum evento de webhook registrado recentemente. Use o botão "Disparar Ping de Teste" acima para testar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Evento</TableHead>
                    <TableHead className="text-xs">Destino / Detalhes</TableHead>
                    <TableHead className="text-xs">Data e Hora</TableHead>
                    <TableHead className="text-xs text-right">Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhookLogs.map((log) => {
                    const meta = log.metadata ? JSON.parse(log.metadata) : {};
                    const isSuccess = meta.success !== false && (meta.status >= 200 && meta.status < 300);

                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-mono text-foreground truncate max-w-sm">
                            {meta.url || log.targetId || 'WEBHOOK_URL'}
                          </div>
                        </TableCell>
                        <TableCell className="text-[11px] font-mono text-muted-foreground">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          {meta.status ? (
                            <Badge
                              variant={isSuccess ? 'outline' : 'destructive'}
                              className={isSuccess ? 'text-[10px] text-emerald-500 border-emerald-500/30' : 'text-[10px]'}
                            >
                              HTTP {meta.status} ({meta.latencyMs}ms)
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Enviado
                            </Badge>
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

      {/* Snippet de Validação de Assinatura para Desenvolvedores */}
      <Card>
        <CardHeader className="p-4 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileCode2 className="size-4 text-emerald-400" />
                <span>Como Validar a Assinatura no seu Backend</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Utilize comparação em tempo constante (<code className="font-mono">crypto.timingSafeEqual</code>) para evitar ataques de timing
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySnippet}
              className="text-xs gap-1.5 h-8"
            >
              {copiedSnippet ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              <span>{copiedSnippet ? 'Copiado!' : 'Copiar Código'}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <pre className="p-3.5 rounded-lg border border-border bg-muted/40 font-mono text-xs overflow-x-auto text-foreground">
            {verificationCodeSnippet}
          </pre>
        </CardContent>
      </Card>
    </PageLayout>
  );
};
