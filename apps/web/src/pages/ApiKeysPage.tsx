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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '../lib/utils';
import { toast } from 'sonner';
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  Trash2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Terminal,
  Zap,
} from 'lucide-react';

export const ApiKeysPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newKeyForm, setNewKeyForm] = useState({
    name: '',
    prefix: 'pk_live',
    role: 'admin',
    expiresInDays: '90',
    allowedOrigins: '',
  });

  // Modal to show raw key once
  const [createdRawKey, setCreatedRawKey] = useState<any | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Fetch API keys
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'api-keys'],
    queryFn: async () => {
      const res = await fetch('/api/admin/api-keys');
      if (!res.ok) throw new Error('Falha ao listar chaves de API');
      return res.json();
    },
  });

  const apiKeys: any[] = data?.apiKeys || [];

  // Create Key Mutation
  const createKeyMutation = useMutation({
    mutationFn: async (payload: typeof newKeyForm) => {
      const allowedOriginsList = payload.allowedOrigins
        ? payload.allowedOrigins.split(',').map((o) => o.trim()).filter(Boolean)
        : undefined;

      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.name,
          prefix: payload.prefix,
          role: payload.role,
          expiresInDays: Number(payload.expiresInDays) || undefined,
          allowedOrigins: allowedOriginsList,
        }),
      });
      if (!res.ok) throw new Error('Falha ao criar chave de API');
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setIsCreateModalOpen(false);
      setNewKeyForm({ name: '', prefix: 'pk_live', role: 'admin', expiresInDays: '90', allowedOrigins: '' });
      setCreatedRawKey(data.apiKey);
      toast.success('Chave de API gerada com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao gerar chave de API.');
    },
  });

  // Revoke Key Mutation
  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const res = await fetch(`/api/admin/api-keys/${keyId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Falha ao revogar chave de API');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Chave de API revogada com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao revogar chave.');
    },
  });

  const handleCopyRawKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
    toast.success('Chave copiada para a área de transferência.');
  };

  return (
    <PageLayout>
      <PageHeader
        title="Chaves de API (M2M)"
        description="Gerencie credenciais Machine-to-Machine para autenticar backends, microsserviços e cron jobs"
        actions={
          <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2 text-xs font-semibold">
            <Plus className="size-4" />
            <span>Nova Chave de API</span>
          </Button>
        }
      />

      {/* Banner de Uso para Desenvolvedores */}
      <Card className="border-indigo-500/20 bg-indigo-500/5">
        <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <Zap className="size-4" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Autenticação M2M Pronta para Produção</p>
              <p className="text-muted-foreground text-[11px]">
                Envie o header <code className="font-mono bg-muted px-1 rounded text-foreground">Authorization: Bearer ek_live_...</code> ou <code className="font-mono bg-muted px-1 rounded text-foreground">x-api-key: ek_live_...</code> em suas requisições HTTP backend-to-backend.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] text-indigo-400 border-indigo-500/30 shrink-0">
            SHA-256 Hashing
          </Badge>
        </CardContent>
      </Card>

      {/* Tabela de Chaves de API */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/60">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="size-4 text-indigo-400" />
            <span>Chaves Cadastradas ({apiKeys.length})</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Apenas o hash criptográfico SHA-256 é armazenado no Cloudflare D1
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin text-indigo-500" />
              <span>Carregando chaves de API...</span>
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              Nenhuma chave de API gerada até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nome & Identificador</TableHead>
                    <TableHead className="text-xs">Prefixo / Hint</TableHead>
                    <TableHead className="text-xs">Função</TableHead>
                    <TableHead className="text-xs">Último Uso</TableHead>
                    <TableHead className="text-xs">Expiração</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((k) => {
                    const isRevoked = Boolean(k.revokedAt);
                    const isExpired = k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();
                    const isLive = k.prefix === 'ek_live';

                    return (
                      <TableRow key={k.id}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <span className="text-xs font-semibold text-foreground">{k.name}</span>
                            <span className="text-[11px] font-mono text-muted-foreground block">{k.id}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 font-mono text-xs">
                            <Badge
                              variant="outline"
                              className={
                                k.prefix.startsWith('pk_')
                                  ? 'text-[10px] text-sky-400 border-sky-500/30 bg-sky-500/10'
                                  : k.prefix.endsWith('_test')
                                  ? 'text-[10px] text-amber-400 border-amber-500/30'
                                  : 'text-[10px] text-emerald-400 border-emerald-500/30'
                              }
                            >
                              {k.prefix}
                            </Badge>
                            <span className="text-muted-foreground">{k.displayKey}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={k.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                            {k.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11px] font-mono text-muted-foreground">
                          {k.lastUsedAt ? formatDate(k.lastUsedAt) : 'Nunca utilizada'}
                        </TableCell>
                        <TableCell className="text-[11px] font-mono text-muted-foreground">
                          {k.expiresAt ? formatDate(k.expiresAt) : 'Nunca expira'}
                        </TableCell>
                        <TableCell>
                          {isRevoked ? (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              Revogada
                            </Badge>
                          ) : isExpired ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              Expirada
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 px-1.5 py-0">
                              <CheckCircle2 className="size-2.5 mr-1" />
                              Ativa
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!isRevoked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Revogar a chave de API "${k.name}"? Microsserviços que usam esta chave perderão acesso imediatamente.`)) {
                                  revokeKeyMutation.mutate(k.id);
                                }
                              }}
                              disabled={revokeKeyMutation.isPending}
                              title="Revogar Chave"
                              className="text-destructive hover:bg-destructive/10 text-xs h-7 px-2"
                            >
                              Revogar
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

      {/* Modal: Gerar Nova Chave */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <KeyRound className="size-4 text-indigo-400" />
              <span>Gerar Nova Chave de API</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Crie uma credencial programática para integrar seus backends ao Edgekit Auth
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              createKeyMutation.mutate(newKeyForm);
            }}
            className="space-y-3.5 mt-2"
          >
            <div className="space-y-1">
              <Label className="text-xs">Nome da Chave / Aplicação</Label>
              <Input
                value={newKeyForm.name}
                onChange={(e) => setNewKeyForm({ ...newKeyForm, name: e.target.value })}
                placeholder="Ex: Billing Service, Background Worker"
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Tipo de Chave & Ambiente</Label>
              <select
                value={newKeyForm.prefix}
                onChange={(e) => setNewKeyForm({ ...newKeyForm, prefix: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-xs shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                <optgroup label="Publishable Keys (Frontends SPAs & Mobile - CORS Protegido)">
                  <option value="pk_live" className="bg-popover text-popover-foreground">pk_live (Produção - Frontend)</option>
                  <option value="pk_test" className="bg-popover text-popover-foreground">pk_test (Testes - Frontend)</option>
                </optgroup>
                <optgroup label="Secret Keys (Backends M2M - Confidencial)">
                  <option value="sk_live" className="bg-popover text-popover-foreground">sk_live (Produção - Backend M2M)</option>
                  <option value="sk_test" className="bg-popover text-popover-foreground">sk_test (Testes - Backend M2M)</option>
                  <option value="ek_live" className="bg-popover text-popover-foreground">ek_live (Legado Produção)</option>
                  <option value="ek_test" className="bg-popover text-popover-foreground">ek_test (Legado Testes)</option>
                </optgroup>
              </select>
            </div>

            {newKeyForm.prefix.startsWith('pk_') && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Domínios Autorizados (CORS Whitelist)</Label>
                  <span className="text-[10px] text-muted-foreground">Opcional</span>
                </div>
                <Input
                  value={newKeyForm.allowedOrigins}
                  onChange={(e) => setNewKeyForm({ ...newKeyForm, allowedOrigins: e.target.value })}
                  placeholder="https://meuapp.com, http://localhost:3000"
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Separe múltiplos domínios por vírgula. Em produção, requisições de outras origens serão bloqueadas.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Função de Acesso</Label>
              <select
                value={newKeyForm.role}
                onChange={(e) => setNewKeyForm({ ...newKeyForm, role: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-xs shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                <option value="admin" className="bg-popover text-popover-foreground">admin (Acesso Completo)</option>
                <option value="read_only" className="bg-popover text-popover-foreground">read_only (Apenas Leitura)</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Expiração</Label>
              <select
                value={newKeyForm.expiresInDays}
                onChange={(e) => setNewKeyForm({ ...newKeyForm, expiresInDays: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-xs shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                <option value="30" className="bg-popover text-popover-foreground">30 dias</option>
                <option value="90" className="bg-popover text-popover-foreground">90 dias (Recomendado)</option>
                <option value="365" className="bg-popover text-popover-foreground">365 dias (1 ano)</option>
                <option value="0" className="bg-popover text-popover-foreground">Nunca expira</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={createKeyMutation.isPending} className="font-semibold">
                {createKeyMutation.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Gerar Chave de API
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Exibição Única da Chave Secreta Gerada */}
      <Dialog open={Boolean(createdRawKey)} onOpenChange={(open) => !open && setCreatedRawKey(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-emerald-500 flex items-center gap-2">
              <CheckCircle2 className="size-4" />
              <span>Chave de API Gerada com Sucesso</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Copie o segredo agora. <strong>Por segurança, você nunca mais poderá vê-lo novamente.</strong>
            </DialogDescription>
          </DialogHeader>

          {createdRawKey && (
            <div className="space-y-3 mt-2">
              <div className="p-3 rounded-lg border border-border bg-muted/40 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Segredo da Chave ({createdRawKey.name})</span>
                  <Badge variant="outline" className="text-[10px] font-mono">{createdRawKey.prefix}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2 bg-background p-2 rounded border border-border font-mono text-xs break-all">
                  <span className="text-foreground font-semibold">{createdRawKey.rawKey}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopyRawKey(createdRawKey.rawKey)}
                    className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                    title="Copiar Chave"
                  >
                    {copiedKey ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 flex items-start gap-2">
                <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                <span>
                  Armazene este valor em um arquivo <code className="font-mono font-bold">.env</code> seguro ou em um gerenciador de segredos. Se perder esta chave, você precisará gerar uma nova.
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              size="sm"
              onClick={() => {
                setCreatedRawKey(null);
                setCopiedKey(false);
              }}
              className="font-semibold"
            >
              Concluído & Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
};
