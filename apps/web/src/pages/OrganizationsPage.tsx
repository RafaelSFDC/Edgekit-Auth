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
  Briefcase,
} from 'lucide-react';

export const OrganizationsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: '', slug: '' });
  const [invite, setInvite] = useState({ email: '', role: 'member' });
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  // List user's organizations
  const { data: orgsData, isLoading: isLoadingOrgs } = useQuery({
    queryKey: ['organizations', 'list'],
    queryFn: async () => {
      const res = await authClient.organization.list();
      return res.data || [];
    },
  });

  const organizations = orgsData || [];
  const activeOrgId = selectedOrgId || organizations[0]?.id;

  // Get full organization data (including members and invitations)
  const { data: fullOrgData, isLoading: isLoadingFullOrg } = useQuery({
    queryKey: ['organization', 'full', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return null;
      const res = await authClient.organization.getFullOrganization({
        query: { organizationId: activeOrgId },
      });
      return res.data;
    },
    enabled: !!activeOrgId,
  });

  // Create Organization Mutation
  const createOrgMutation = useMutation({
    mutationFn: async (data: typeof newOrg) => {
      return authClient.organization.create({
        name: data.name,
        slug: data.slug || data.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      });
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setIsCreateOrgModalOpen(false);
      setNewOrg({ name: '', slug: '' });
      if (res?.data?.id) setSelectedOrgId(res.data.id);
      toast.success('Organização criada com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao criar organização.');
    },
  });

  // Invite Member Mutation
  const inviteMutation = useMutation({
    mutationFn: async (data: typeof invite) => {
      if (!activeOrgId) throw new Error('Selecione uma organização.');
      return authClient.organization.inviteMember({
        organizationId: activeOrgId,
        email: data.email,
        role: data.role as any,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'full', activeOrgId] });
      setIsInviteModalOpen(false);
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
      if (!activeOrgId) return;
      return authClient.organization.removeMember({
        organizationId: activeOrgId,
        memberIdOrEmail,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'full', activeOrgId] });
      toast.success('Membro removido da organização.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao remover membro.');
    },
  });

  // Update Member Role Mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      if (!activeOrgId) return;
      return authClient.organization.updateMemberRole({
        organizationId: activeOrgId,
        memberId,
        role: role as any,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'full', activeOrgId] });
      toast.success('Papel do membro atualizado com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao atualizar papel do membro.');
    },
  });

  // Delete Organization Mutation
  const deleteOrgMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      return authClient.organization.delete({
        organizationId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setSelectedOrgId(null);
      toast.success('Organização excluída com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao excluir organização.');
    },
  });

  const activeOrg = organizations.find((o) => o.id === activeOrgId);
  const members = fullOrgData?.members || [];
  const invitations = fullOrgData?.invitations || [];

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

      {/* Seletor de Organização */}
      {organizations.length > 0 && (
        <div className="flex items-center gap-3 overflow-x-auto pb-2">
          {organizations.map((org) => {
            const isSelected = org.id === activeOrgId;
            return (
              <button
                key={org.id}
                onClick={() => setSelectedOrgId(org.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-xs font-semibold transition-all shrink-0 ${
                  isSelected
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-500 shadow-xs'
                    : 'bg-card border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <Building2 className="size-4" />
                <span>{org.name}</span>
                <Badge variant={isSelected ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                  {org.slug}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      {/* Detalhes da Organização Ativa */}
      {isLoadingOrgs ? (
        <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin text-indigo-500" />
          <span>{t.common.loading}</span>
        </div>
      ) : !activeOrg ? (
        <Card className="text-center p-12 space-y-4">
          <Building2 className="size-12 text-muted-foreground mx-auto opacity-40" />
          <h3 className="text-sm font-semibold text-foreground">Nenhuma organização cadastrada</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Crie a primeira organização multi-tenant para agrupar membros e definir papéis RBAC.
          </p>
          <Button onClick={() => setIsCreateOrgModalOpen(true)} size="sm">
            Criar Organização
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Card de Informações da Organização */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/60">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold">
                  <Building2 className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">{activeOrg.name}</CardTitle>
                  <CardDescription className="text-xs font-mono text-muted-foreground">
                    ID: {activeOrg.id} • Slug: /{activeOrg.slug}
                  </CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsInviteModalOpen(true)}
                  className="gap-2 text-xs font-medium"
                >
                  <UserPlus className="size-3.5 text-indigo-500" />
                  <span>{t.organizations.inviteMember}</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm(t.organizations.deleteOrgConfirm)) {
                      deleteOrgMutation.mutate(activeOrg.id);
                    }
                  }}
                  disabled={deleteOrgMutation.isPending}
                  className="gap-2 text-xs font-medium text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5" />
                  <span>{t.organizations.deleteOrg}</span>
                </Button>
              </div>
            </CardHeader>

            {/* Lista de Membros */}
            <CardContent className="p-0">
              {isLoadingFullOrg ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin inline-block mr-2" />
                  Carregando colaboradores...
                </div>
              ) : members.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Nenhum membro listado.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Colaborador</TableHead>
                      <TableHead className="text-xs">Papel RBAC</TableHead>
                      <TableHead className="text-xs">Membro Desde</TableHead>
                      <TableHead className="text-xs text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m: any) => {
                      const isOwner = m.role === 'owner';
                      const isAdmin = m.role === 'admin';

                      return (
                        <TableRow key={m.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="size-7 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs uppercase">
                                {m.user?.name?.[0] || m.user?.email?.[0] || 'M'}
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-foreground">
                                  {m.user?.name || 'Membro'}
                                </div>
                                <div className="text-[11px] text-muted-foreground font-mono">
                                  {m.user?.email}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={isOwner ? 'default' : isAdmin ? 'secondary' : 'outline'}
                              className="text-[10px] px-2 py-0"
                            >
                              {isOwner ? <Crown className="size-3 mr-1" /> : isAdmin ? <Shield className="size-3 mr-1" /> : null}
                              {m.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[11px] font-mono text-muted-foreground">
                            {formatDate(m.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            {!isOwner && (
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    const nextRole = isAdmin ? 'member' : 'admin';
                                    updateRoleMutation.mutate({ memberId: m.id, role: nextRole });
                                  }}
                                  disabled={updateRoleMutation.isPending}
                                  title={t.organizations.changeMemberRole}
                                  className="size-7 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
                                >
                                  <Shield className="size-3.5" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    if (confirm(t.organizations.removeMemberConfirm)) {
                                      removeMemberMutation.mutate(m.id);
                                    }
                                  }}
                                  disabled={removeMemberMutation.isPending}
                                  title={t.organizations.removeMember}
                                  className="size-7 text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal: Criar Organização */}
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
                onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                placeholder="Ex: Minha Empresa Corp"
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t.organizations.createModal.slugLabel}</Label>
              <Input
                value={newOrg.slug}
                onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })}
                placeholder="minha-empresa"
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

      {/* Modal: Convidar Membro */}
      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">{t.organizations.inviteModal.title}</DialogTitle>
            <DialogDescription className="text-xs">{t.organizations.inviteModal.description}</DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              inviteMutation.mutate(invite);
            }}
            className="space-y-3.5 mt-2"
          >
            <div className="space-y-1">
              <Label className="text-xs">{t.organizations.inviteModal.emailLabel}</Label>
              <Input
                type="email"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                placeholder="colaborador@empresa.com"
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t.organizations.inviteModal.roleLabel}</Label>
              <select
                value={invite.role}
                onChange={(e) => setInvite({ ...invite, role: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-xs shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                <option value="member" className="bg-popover text-popover-foreground">member (Membro regular)</option>
                <option value="admin" className="bg-popover text-popover-foreground">admin (Administrador)</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsInviteModalOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={inviteMutation.isPending} className="font-semibold">
                {inviteMutation.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                {t.organizations.inviteModal.submit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
};
