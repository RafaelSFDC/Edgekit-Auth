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
import { formatDate, cn } from '../lib/utils';
import { toast } from 'sonner';
import {
  Search,
  UserPlus,
  Shield,
  ShieldAlert,
  Ban,
  CheckCircle,
  Eye,
  Loader2,
  Trash2,
  Sparkles,
} from 'lucide-react';

export const UsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserForBan, setSelectedUserForBan] = useState<any | null>(null);
  const [banReason, setBanReason] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' });

  // Fetch users from Better Auth Admin API
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', searchTerm],
    queryFn: async () => {
      const res = await (authClient.admin as any).listUsers({
        query: {
          searchValue: searchTerm || undefined,
          limit: 50,
        },
      });
      return res.data;
    },
  });

  const users: any[] = data?.users || [];

  // Ban Mutation
  const banMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      return (authClient.admin as any).banUser({
        userId,
        banReason: reason || 'Suspenso pelo Administrador do Console',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setSelectedUserForBan(null);
      setBanReason('');
      toast.success('Usuário suspenso com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao suspender usuário.');
    },
  });

  // Unban Mutation
  const unbanMutation = useMutation({
    mutationFn: async (userId: string) => {
      return (authClient.admin as any).unbanUser({ userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Acesso restaurado com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao desbanir usuário.');
    },
  });

  // Set Role Mutation
  const setRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return (authClient.admin as any).setRole({ userId, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Função do usuário atualizada com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao alterar função.');
    },
  });

  // Create User Mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      return (authClient.admin as any).createUser({
        name: userData.name,
        email: userData.email,
        password: userData.password,
        role: userData.role,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setIsCreateModalOpen(false);
      setNewUser({ name: '', email: '', password: '', role: 'user' });
      toast.success('Usuário criado com sucesso no Cloudflare D1!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao criar usuário.');
    },
  });

  // Delete User Mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return (authClient.admin as any).removeUser({ userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Conta de usuário removida do banco.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao remover usuário.');
    },
  });

  // Impersonate Mutation
  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      return (authClient.admin as any).impersonateUser({ userId });
    },
    onSuccess: () => {
      toast.success('Sessão personificada com sucesso! Redirecionando...');
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Falha ao personificar usuário.');
    },
  });

  return (
    <PageLayout>
      <PageHeader
        title={t.users.title}
        description={t.users.subtitle}
        actions={
          <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2 text-xs font-semibold">
            <UserPlus className="size-4" />
            <span>{t.users.createUser}</span>
          </Button>
        }
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
              placeholder={t.users.searchPlaceholder}
              className="pl-9 text-xs h-9"
            />
          </div>
        </CardHeader>

        {/* Tabela de Usuários */}
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin text-indigo-500" />
              <span>{t.common.loading}</span>
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              Nenhum usuário encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t.users.table.user}</TableHead>
                    <TableHead className="text-xs">{t.users.table.role}</TableHead>
                    <TableHead className="text-xs">{t.users.table.status}</TableHead>
                    <TableHead className="text-xs">{t.users.table.created}</TableHead>
                    <TableHead className="text-xs text-right">{t.users.table.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const isBanned = Boolean(u.banned);
                    const isAdmin = u.role === 'admin';

                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
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
                        </TableCell>
                        <TableCell>
                          <Badge variant={isAdmin ? 'default' : 'secondary'} className="text-[10px] px-2 py-0">
                            {isAdmin ? <Shield className="size-3 mr-1" /> : null}
                            {u.role || 'user'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isBanned ? (
                            <Badge variant="destructive" className="text-[10px] px-2 py-0">
                              <ShieldAlert className="size-3 mr-1" />
                              Suspenso
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 px-2 py-0">
                              <CheckCircle className="size-3 mr-1" />
                              Ativo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-[11px] font-mono text-muted-foreground">
                          {formatDate(u.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Impersonate Button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => impersonateMutation.mutate(u.id)}
                              disabled={impersonateMutation.isPending}
                              title={t.users.actions.impersonate}
                              className="size-7 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                            >
                              <Sparkles className="size-3.5" />
                            </Button>

                            {/* Ban / Unban Toggle */}
                            {isBanned ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => unbanMutation.mutate(u.id)}
                                disabled={unbanMutation.isPending}
                                title={t.users.actions.unban}
                                className="size-7 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                              >
                                <CheckCircle className="size-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSelectedUserForBan(u)}
                                title={t.users.actions.ban}
                                className="size-7 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                              >
                                <Ban className="size-3.5" />
                              </Button>
                            )}

                            {/* Toggle Role Button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const nextRole = isAdmin ? 'user' : 'admin';
                                const confirmMsg = isAdmin
                                  ? `Rebaixar ${u.email} para usuário comum?`
                                  : `Promover ${u.email} para Administrador?`;
                                if (confirm(confirmMsg)) {
                                  setRoleMutation.mutate({ userId: u.id, role: nextRole });
                                }
                              }}
                              disabled={setRoleMutation.isPending}
                              title={isAdmin ? t.users.actions.demoteUser : t.users.actions.promoteAdmin}
                              className={cn(
                                'size-7',
                                isAdmin
                                  ? 'text-sky-400 hover:text-sky-300 hover:bg-sky-500/10'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                              )}
                            >
                              <Shield className="size-3.5" />
                            </Button>

                            {/* Delete Button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm(`Deseja realmente remover o usuário ${u.email}?`)) {
                                  deleteUserMutation.mutate(u.id);
                                }
                              }}
                              disabled={deleteUserMutation.isPending}
                              title={t.users.actions.delete}
                              className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
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

      {/* Modal: Criar Novo Usuário */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">{t.users.createModal.title}</DialogTitle>
            <DialogDescription className="text-xs">{t.users.createModal.description}</DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              createUserMutation.mutate(newUser);
            }}
            className="space-y-3.5 mt-2"
          >
            <div className="space-y-1">
              <Label className="text-xs">{t.users.createModal.nameLabel}</Label>
              <Input
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="Ex: Ana Silva"
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t.users.createModal.emailLabel}</Label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="ana@empresa.com"
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t.users.createModal.passwordLabel}</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t.users.createModal.roleLabel}</Label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-xs shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                <option value="user" className="bg-popover text-popover-foreground">user (Padrão)</option>
                <option value="admin" className="bg-popover text-popover-foreground">admin (Administrador)</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateModalOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={createUserMutation.isPending} className="font-semibold">
                {createUserMutation.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                {t.users.createModal.submit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Suspender / Banir Usuário */}
      <Dialog open={Boolean(selectedUserForBan)} onOpenChange={(open) => !open && setSelectedUserForBan(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-amber-500 flex items-center gap-2">
              <Ban className="size-4" />
              <span>{t.users.banModal.title}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t.users.banModal.description} Usuário: <strong>{selectedUserForBan?.email}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">{t.users.banModal.reasonLabel}</Label>
              <Input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder={t.users.banModal.reasonPlaceholder}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedUserForBan(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={banMutation.isPending}
              onClick={() => {
                if (selectedUserForBan) {
                  banMutation.mutate({ userId: selectedUserForBan.id, reason: banReason });
                }
              }}
              className="font-semibold"
            >
              {banMutation.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              {t.users.banModal.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
};
