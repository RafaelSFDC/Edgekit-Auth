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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '../lib/utils';
import { toast } from 'sonner';
import {
  Building2,
  Plus,
  Users,
  UserPlus,
  Crown,
  Shield,
  Mail,
  Trash2,
  Loader2,
  Search,
  Eye,
  CheckCircle,
  Clock,
  Copy,
  Check,
} from 'lucide-react';

export const OrganizationsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: '', slug: '' });
  const [selectedOrgForDetails, setSelectedOrgForDetails] = useState<any | null>(null);
  const [invite, setInvite] = useState({ email: '', role: 'member' });
  const [copiedId, setCopiedId] = useState(false);

  // 1. Fetch Global List of All Organizations across the D1 instance via /api/admin/organizations
  const { data: globalOrgsData, isLoading: isLoadingOrgs } = useQuery({
    queryKey: ['admin', 'organizations', searchTerm],
    queryFn: async () => {
      const url = searchTerm
        ? `/api/admin/organizations?search=${encodeURIComponent(searchTerm)}`
        : '/api/admin/organizations';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao listar organizações globais');
      return res.json();
    },
  });

  const organizations: any[] = globalOrgsData?.organizations || [];

  // 2. Fetch specific Organization Details (Members & Invitations)
  const {
    data: orgDetailsData,
    isLoading: isLoadingOrgDetails,
    refetch: refetchOrgDetails,
  } = useQuery({
    queryKey: ['admin', 'organization-details', selectedOrgForDetails?.id],
    queryFn: async () => {
      if (!selectedOrgForDetails?.id) return null;
      const res = await fetch(`/api/admin/organizations/${selectedOrgForDetails.id}`);
      if (!res.ok) throw new Error('Falha ao carregar detalhes da organização');
      return res.json();
    },
    enabled: Boolean(selectedOrgForDetails?.id),
  });

  const members: any[] = orgDetailsData?.members || [];
  const invitations: any[] = orgDetailsData?.invitations || [];

  // Create Organization Mutation
  const createOrgMutation = useMutation({
    mutationFn: async (data: typeof newOrg) => {
      return authClient.organization.create({
        name: data.name,
        slug: data.slug || data.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setIsCreateOrgModalOpen(false);
      setNewOrg({ name: '', slug: '' });
      toast.success('Organização criada com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao criar organização.');
    },
  });

  // Invite Member Mutation
  const inviteMutation = useMutation({
    mutationFn: async (data: typeof invite) => {
      if (!selectedOrgForDetails?.id) throw new Error('Selecione uma organização.');
      return authClient.organization.inviteMember({
        organizationId: selectedOrgForDetails.id,
        email: data.email,
        role: data.role as any,
      });
    },
    onSuccess: () => {
      refetchOrgDetails();
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setInvite({ email: '', role: 'member' });
      toast.success('Convite de colaboração enviado com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao convidar membro.');
    },
  });

  // Remove Member Mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (memberIdOrEmail: string) => {
      if (!selectedOrgForDetails?.id) return;
      return authClient.organization.removeMember({
        organizationId: selectedOrgForDetails.id,
        memberIdOrEmail,
      });
    },
    onSuccess: () => {
      refetchOrgDetails();
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Membro removido da organização.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao remover membro.');
    },
  });

  // Update Member Role Mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      if (!selectedOrgForDetails?.id) return;
      return authClient.organization.updateMemberRole({
        organizationId: selectedOrgForDetails.id,
        memberId,
        role: role as any,
      });
    },
    onSuccess: () => {
      refetchOrgDetails();
      toast.success('Função do membro atualizada com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao atualizar função.');
    },
  });

  // Delete Organization Mutation (as Admin)
  const deleteOrgMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      const res = await fetch(`/api/admin/organizations/${organizationId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Falha ao excluir organização');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setSelectedOrgForDetails(null);
      toast.success('Organização excluída permanentemente.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao excluir organização.');
    },
  });

  // Cancel Invitation Mutation
  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return authClient.organization.cancelInvitation({
        invitationId,
      });
    },
    onSuccess: () => {
      refetchOrgDetails();
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
      toast.success('Convite cancelado.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao cancelar convite.');
    },
  });

  const totalMembersGlobal = organizations.reduce((acc, o) => acc + (o.membersCount || 0), 0);

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <PageLayout>
      <PageHeader
        title={t.organizations.title}
        description={t.organizations.subtitle}
        actions={
          <Button onClick={() => setIsCreateOrgModalOpen(true)} className="gap-2 text-xs font-semibold">
            <Plus className="size-4" />
            <span>{t.organizations.createOrg}</span>
          </Button>
        }
      />

      {/* Grid de Resumo Multi-Tenant */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Building2 className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Organizações na Instância</p>
                <p className="text-2xl font-extrabold text-foreground">{organizations.length}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] text-sky-400 border-sky-500/30">
              B2B Tenants
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Users className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Membros Totais em Equipes</p>
                <p className="text-2xl font-extrabold text-foreground">{totalMembersGlobal}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] text-indigo-400 border-indigo-500/30">
              Colaboradores
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Card da Lista Global de Organizações */}
      <Card>
        <CardHeader className="p-4 border-b border-border/60">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="size-4 text-muted-foreground absolute left-3 top-2.5" />
              <Input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar organizações por nome ou slug..."
                className="pl-9 text-xs h-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoadingOrgs ? (
            <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin text-indigo-500" />
              <span>{t.common.loading}</span>
            </div>
          ) : organizations.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              Nenhuma organização encontrada na base de dados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Organização</TableHead>
                    <TableHead className="text-xs">Proprietário (Owner)</TableHead>
                    <TableHead className="text-xs">Membros</TableHead>
                    <TableHead className="text-xs">Convites</TableHead>
                    <TableHead className="text-xs">Criada em</TableHead>
                    <TableHead className="text-xs text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizations.map((org) => (
                    <TableRow
                      key={org.id}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => setSelectedOrgForDetails(org)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                            {org.name?.[0] || 'O'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground truncate">{org.name}</div>
                            <div className="text-[11px] text-muted-foreground font-mono truncate">{org.slug}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {org.owner ? (
                          <div className="text-xs">
                            <span className="font-medium text-foreground">{org.owner.name || 'Sem nome'}</span>
                            <span className="text-[11px] text-muted-foreground block font-mono">{org.owner.email}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Sem proprietário</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px] px-2 py-0 font-medium">
                          <Users className="size-3 mr-1 text-sky-400" />
                          {org.membersCount}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {org.invitationsCount > 0 ? (
                          <Badge variant="secondary" className="text-[10px] px-2 py-0">
                            <Clock className="size-3 mr-1 text-amber-400" />
                            {org.invitationsCount} pendente{org.invitationsCount === 1 ? '' : 's'}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-[11px] font-mono text-muted-foreground">
                        {formatDate(org.createdAt)}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedOrgForDetails(org)}
                            title="Inspecionar Membros e Configurações"
                            className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Tem certeza que deseja excluir a organização "${org.name}" permanentemente?`)) {
                                deleteOrgMutation.mutate(org.id);
                              }
                            }}
                            disabled={deleteOrgMutation.isPending}
                            title="Excluir Organização"
                            className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: Detalhes, Membros e Convites da Organização */}
      <Dialog open={Boolean(selectedOrgForDetails)} onOpenChange={(open) => !open && setSelectedOrgForDetails(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedOrgForDetails && (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-lg bg-sky-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center font-bold text-sm uppercase">
                      {selectedOrgForDetails.name?.[0] || 'O'}
                    </div>
                    <div>
                      <DialogTitle className="text-base font-bold text-foreground">
                        {selectedOrgForDetails.name}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground font-mono">
                        slug: /{selectedOrgForDetails.slug}
                      </DialogDescription>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Deseja realmente excluir a organização "${selectedOrgForDetails.name}"?`)) {
                        deleteOrgMutation.mutate(selectedOrgForDetails.id);
                      }
                    }}
                    disabled={deleteOrgMutation.isPending}
                    className="text-xs h-7 gap-1"
                  >
                    <Trash2 className="size-3" />
                    <span>Excluir Org</span>
                  </Button>
                </div>
              </DialogHeader>

              {/* Informações Básicas da Organização */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-border/80 bg-muted/20 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">ID da Organização (D1)</span>
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="truncate">{selectedOrgForDetails.id}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyId(selectedOrgForDetails.id)}
                      className="size-6 text-muted-foreground hover:text-foreground"
                      title="Copiar ID"
                    >
                      {copiedId ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                    </Button>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-border/80 bg-muted/20 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">Data de Criação</span>
                  <div className="text-xs font-mono">{formatDate(selectedOrgForDetails.createdAt)}</div>
                </div>
              </div>

              {/* Tabs: Membros vs Convites vs Novo Convite */}
              <Tabs defaultValue="members" className="w-full">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="members" className="text-xs">
                    Membros ({members.length})
                  </TabsTrigger>
                  <TabsTrigger value="invitations" className="text-xs">
                    Convites ({invitations.length})
                  </TabsTrigger>
                  <TabsTrigger value="invite" className="text-xs">
                    Convidar
                  </TabsTrigger>
                </TabsList>

                {/* Tab: Membros */}
                <TabsContent value="members" className="space-y-3 pt-3">
                  {isLoadingOrgDetails ? (
                    <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin text-indigo-500" />
                      <span>Carregando membros...</span>
                    </div>
                  ) : members.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                      Nenhum membro vinculado a esta organização.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {members.map((m: any) => {
                        const isOwner = m.role === 'owner';
                        return (
                          <div
                            key={m.id}
                            className="p-3 rounded-lg border border-border/80 bg-muted/30 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="size-7 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                {m.name?.[0] || m.email?.[0] || 'M'}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground truncate">{m.name || 'Sem nome'}</div>
                                <div className="text-[11px] text-muted-foreground font-mono truncate">{m.email}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant={isOwner ? 'default' : 'secondary'} className="text-[10px] px-2 py-0">
                                {isOwner && <Crown className="size-3 mr-1 text-amber-400" />}
                                {m.role}
                              </Badge>

                              {!isOwner && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm(`Remover ${m.email} desta organização?`)) {
                                      removeMemberMutation.mutate(m.id);
                                    }
                                  }}
                                  disabled={removeMemberMutation.isPending}
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7 px-2"
                                >
                                  Remover
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* Tab: Convites Pendentes */}
                <TabsContent value="invitations" className="space-y-3 pt-3">
                  {isLoadingOrgDetails ? (
                    <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin text-indigo-500" />
                      <span>Carregando convites...</span>
                    </div>
                  ) : invitations.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                      Nenhum convite pendente para esta organização.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {invitations.map((inv: any) => (
                        <div
                          key={inv.id}
                          className="p-3 rounded-lg border border-border/80 bg-muted/30 flex items-center justify-between text-xs"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <Mail className="size-3.5 text-muted-foreground shrink-0" />
                              <span className="font-semibold text-foreground truncate">{inv.email}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {inv.role || 'member'}
                              </Badge>
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground">
                              Expira em: {formatDate(inv.expiresAt)}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelInvitationMutation.mutate(inv.id)}
                            disabled={cancelInvitationMutation.isPending}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7 px-2 shrink-0"
                          >
                            Cancelar
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Tab: Convidar Novo Membro */}
                <TabsContent value="invite" className="space-y-3 pt-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      inviteMutation.mutate(invite);
                    }}
                    className="space-y-3 p-4 rounded-lg border border-border bg-card"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs">{t.organizations.inviteModal.emailLabel}</Label>
                      <Input
                        type="email"
                        value={invite.email}
                        onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                        placeholder="colaborador@empresa.com"
                        required
                        className="text-xs h-8"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">{t.organizations.inviteModal.roleLabel}</Label>
                      <select
                        value={invite.role}
                        onChange={(e) => setInvite({ ...invite, role: e.target.value })}
                        className="w-full h-8 rounded-md border border-input bg-transparent px-3 text-xs shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
                      >
                        <option value="member" className="bg-popover text-popover-foreground">member (Membro regular)</option>
                        <option value="admin" className="bg-popover text-popover-foreground">admin (Administrador da Org)</option>
                      </select>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <Button type="submit" size="sm" disabled={inviteMutation.isPending} className="text-xs font-semibold">
                        {inviteMutation.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                        {t.organizations.inviteModal.submit}
                      </Button>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>

              <DialogFooter className="pt-2 border-t border-border/60">
                <Button variant="outline" size="sm" onClick={() => setSelectedOrgForDetails(null)}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Criar Nova Organização */}
      <Dialog open={isCreateOrgModalOpen} onOpenChange={setIsCreateOrgModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">{t.organizations.createModal.title}</DialogTitle>
            <DialogDescription className="text-xs">{t.organizations.createModal.description}</DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              createOrgMutation.mutate(newOrg);
            }}
            className="space-y-3.5 mt-2"
          >
            <div className="space-y-1">
              <Label className="text-xs">{t.organizations.createModal.nameLabel}</Label>
              <Input
                value={newOrg.name}
                onChange={(e) => {
                  const name = e.target.value;
                  const autoSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
                  setNewOrg({ name, slug: newOrg.slug ? newOrg.slug : autoSlug });
                }}
                placeholder="Ex: Beta Labs"
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t.organizations.createModal.slugLabel}</Label>
              <Input
                value={newOrg.slug}
                onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })}
                placeholder="Ex: beta-labs"
                required
                className="text-xs font-mono"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOrgModalOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={createOrgMutation.isPending} className="font-semibold">
                {createOrgMutation.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                {t.organizations.createModal.submit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
};
