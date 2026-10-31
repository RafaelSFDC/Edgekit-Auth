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
import { toast } from 'sonner';
import {
  CreditCard,
  Plus,
  CheckCircle,
  Zap,
  Trash2,
  Building,
  User,
  DollarSign,
} from 'lucide-react';

export const BillingPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [newPlan, setNewPlan] = useState({
    name: '',
    slug: '',
    description: '',
    priceMonthly: 0,
    priceYearly: 0,
    currency: 'usd',
    features: '',
    stripeProductId: '',
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
  });

  // 1. Fetch plans
  const { data: plansData, isLoading: _isLoadingPlans } = useQuery({
    queryKey: ['billing', 'admin', 'plans'],
    queryFn: async () => {
      const res = await fetch('/api/billing/admin/plans');
      if (!res.ok) return { plans: [] };
      return res.json();
    },
  });

  // 2. Fetch subscriptions
  const { data: subsData, isLoading: _isLoadingSubs } = useQuery({
    queryKey: ['billing', 'admin', 'subscriptions'],
    queryFn: async () => {
      const res = await fetch('/api/billing/admin/subscriptions');
      if (!res.ok) return { subscriptions: [] };
      return res.json();
    },
  });

  const plans: any[] = plansData?.plans || [];
  const subscriptions: any[] = subsData?.subscriptions || [];

  // Create plan mutation
  const createPlanMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/billing/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          priceMonthly: Number(payload.priceMonthly) * 100, // convert to cents
          priceYearly: Number(payload.priceYearly) * 100,
          stripeProductId: payload.stripeProductId?.trim() || null,
          stripePriceIdMonthly: payload.stripePriceIdMonthly?.trim() || null,
          stripePriceIdYearly: payload.stripePriceIdYearly?.trim() || null,
          features: payload.features
            .split(',')
            .map((f: string) => f.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Falha ao criar plano');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'admin', 'plans'] });
      toast.success('Plano de cobrança criado com sucesso!');
      setIsPlanModalOpen(false);
      setNewPlan({
        name: '',
        slug: '',
        description: '',
        priceMonthly: 0,
        priceYearly: 0,
        currency: 'usd',
        features: '',
        stripeProductId: '',
        stripePriceIdMonthly: '',
        stripePriceIdYearly: '',
      });
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  // Delete plan mutation
  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/billing/admin/plans/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao remover plano');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'admin', 'plans'] });
      toast.success('Plano removido.');
    },
  });

  return (
    <PageLayout>
      <PageHeader
        title="Billing & Planos"
        description="Gestão integrada de faturamento no estilo Clerk Billing: planos de assinatura, preços, limites e entitlements."
      >
        <Button size="sm" onClick={() => setIsPlanModalOpen(true)} className="gap-1.5 bg-indigo-600 hover:bg-indigo-500">
          <Plus className="size-4" /> Novo Plano
        </Button>
      </PageHeader>

      <div className="grid gap-6">
        {/* Status da Integração Stripe */}
        <Card className="border-indigo-500/20 bg-muted/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <CreditCard className="size-5" />
              </div>
              <div>
                <p className="text-xs font-semibold">Motor de Faturamento do Edgekit</p>
                <p className="text-xs text-muted-foreground">
                  Suporta Stripe Connect / Webhooks reais e modo de simulação de sandbox automática para desenvolvimento.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 gap-1">
              <CheckCircle className="size-3" /> Motor Ativo
            </Badge>
          </CardContent>
        </Card>

        {/* Grade de Planos Cadastrados */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Zap className="size-4 text-indigo-500" /> Planos de Assinatura ({plans.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.length === 0 ? (
              <Card className="col-span-3 p-8 text-center text-muted-foreground">
                Nenhum plano cadastrado ainda. Clique em "Novo Plano" para criar um plano Pro ou Starter.
              </Card>
            ) : (
              plans.map((p) => {
                let featuresList: string[] = [];
                try {
                  featuresList = JSON.parse(p.features || '[]');
                } catch {}

                return (
                  <Card key={p.id} className="flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="font-mono text-xs">{p.slug}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:bg-destructive/10"
                          onClick={() => deletePlanMutation.mutate(p.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <CardTitle className="text-lg mt-2">{p.name}</CardTitle>
                      <CardDescription className="text-xs">{p.description || 'Sem descrição'}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">
                          ${(p.priceMonthly / 100).toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground">/mês</span>
                      </div>

                      {featuresList.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Entitlements:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {featuresList.map((f: string) => (
                              <Badge key={f} variant="outline" className="text-[10px] font-mono bg-muted/20">
                                {f}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        {/* Tabela de Assinaturas Ativas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="size-5 text-emerald-500" /> Assinaturas Ativas da Instância ({subscriptions.length})
            </CardTitle>
            <CardDescription>
              Clientes (organizações B2B ou usuários individuais) com planos ativos.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alvo (Target)</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stripe Sub ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      Nenhuma assinatura registrada até o momento.
                    </TableCell>
                  </TableRow>
                ) : (
                  subscriptions.map((s, idx) => (
                    <TableRow key={s.subscription?.id || idx}>
                      <TableCell className="font-mono text-xs">{s.subscription?.targetId}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 capitalize text-xs">
                          {s.subscription?.targetType === 'organization' ? (
                            <>
                              <Building className="size-3.5 text-indigo-400" /> Organização
                            </>
                          ) : (
                            <>
                              <User className="size-3.5 text-emerald-400" /> Usuário
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-semibold text-xs">
                          {s.planName || s.planSlug}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-xs text-emerald-400">
                          {s.subscription?.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {s.subscription?.stripeSubscriptionId || 'Simulação Local'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Modal: Novo Plano */}
      <Dialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Plano de Assinatura</DialogTitle>
            <DialogDescription>
              Configure o preço, a chave identificadora e os recursos/entitlements concedidos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nome do Plano</Label>
                <Input
                  placeholder="Ex: Pro Plan"
                  value={newPlan.name}
                  onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Slug / Identificador</Label>
                <Input
                  placeholder="Ex: pro"
                  value={newPlan.slug}
                  onChange={(e) => setNewPlan({ ...newPlan, slug: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input
                placeholder="Plano para empresas em crescimento"
                value={newPlan.description}
                onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Preço Mensal (USD)</Label>
                <Input
                  type="number"
                  placeholder="29"
                  value={newPlan.priceMonthly}
                  onChange={(e) => setNewPlan({ ...newPlan, priceMonthly: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label>Preço Anual (USD)</Label>
                <Input
                  type="number"
                  placeholder="290"
                  value={newPlan.priceYearly}
                  onChange={(e) => setNewPlan({ ...newPlan, priceYearly: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Entitlements / Features (separadas por vírgula)</Label>
              <Input
                placeholder="analytics:advanced, export_pdf, unlimited_members"
                value={newPlan.features}
                onChange={(e) => setNewPlan({ ...newPlan, features: e.target.value })}
              />
            </div>

            <div className="pt-2 border-t space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Integração Stripe (Opcional)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Stripe Price ID (Mensal)</Label>
                  <Input
                    placeholder="price_1N..."
                    value={newPlan.stripePriceIdMonthly}
                    onChange={(e) => setNewPlan({ ...newPlan, stripePriceIdMonthly: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Stripe Price ID (Anual)</Label>
                  <Input
                    placeholder="price_1N..."
                    value={newPlan.stripePriceIdYearly}
                    onChange={(e) => setNewPlan({ ...newPlan, stripePriceIdYearly: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPlanModalOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createPlanMutation.mutate(newPlan)}
              disabled={!newPlan.name || !newPlan.slug || createPlanMutation.isPending}
            >
              Salvar Plano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
};
