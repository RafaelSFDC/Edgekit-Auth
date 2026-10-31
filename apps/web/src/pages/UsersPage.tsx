import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient } from '../lib/auth-client';
import { useI18n } from '../i18n/context';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
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
  KeyRound,
  Laptop,
  Copy,
  Check,
} from 'lucide-react';

export const UsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [now] = useState(() => Date.now());

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserForBan, setSelectedUserForBan] = useState<any | null>(null);
  const [banReason, setBanReason] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' });

  // Inspection Drawer / Dialog State
  const [inspectingUser, setInspectingUser] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [newPasswordForUser, setNewPasswordForUser] = useState('');

  // 3-Tier Metadata & Preferences State
  const [userPublicMeta, setUserPublicMeta] = useState('{}');
  const [userPrivateMeta, setUserPrivateMeta] = useState('{}');
  const [userUnsafeMeta, setUserUnsafeMeta] = useState('{}');
  const [userPreferences, setUserPreferences] = useState('{}');
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  // Fetch metadata when inspecting a user
  const { data: inspectingUserMeta } = useQuery({
    queryKey: ['admin', 'user-metadata', inspectingUser?.id],
    queryFn: async () => {
      if (!inspectingUser?.id) return null;
      const res = await fetch(`/api/admin/users/${inspectingUser.id}/metadata`);
      if (!res.ok) return null;
      const data = await res.json();
      setUserPublicMeta(JSON.stringify(data.publicMetadata || {}, null, 2));
      setUserPrivateMeta(JSON.stringify(data.privateMetadata || {}, null, 2));
      setUserUnsafeMeta(JSON.stringify(data.unsafeMetadata || {}, null, 2));
      setUserPreferences(JSON.stringify(data.preferences || {}, null, 2));
      return data;
    },
    enabled: Boolean(inspectingUser?.id),
  });

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

  // Query user sessions when inspecting a user
  const {
    data: userSessionsData,
    isLoading: isLoadingSessions,
    refetch: refetchUserSessions,
  } = useQuery({
    queryKey: ['admin', 'user-sessions', inspectingUser?.id],
    queryFn: async () => {
      if (!inspectingUser?.id) return [];
      const res = await (authClient.admin as any).listUserSessions({
        userId: inspectingUser.id,
      });
      return res.data?.sessions || res.data || [];
    },
    enabled: Boolean(inspectingUser?.id),
  });

  const userSessions: any[] = Array.isArray(userSessionsData) ? userSessionsData : [];

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
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setSelectedUserForBan(null);
      setBanReason('');
      if (inspectingUser) {
        setInspectingUser({ ...inspectingUser, banned: true, banReason });
      }
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      if (inspectingUser) {
        setInspectingUser({ ...inspectingUser, banned: false, banReason: null });
      }
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      if (inspectingUser && inspectingUser.id === variables.userId) {
        setInspectingUser({ ...inspectingUser, role: variables.role });
      }
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setInspectingUser(null);
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

  // Revoke User Session Mutation
  const handleSaveMetadata = async () => {
    if (!inspectingUser?.id) return;
    setIsSavingMeta(true);
    try {
      let pub = {};
      let priv = {};
      let uns = {};
      let pref = {};
      try {
        pub = JSON.parse(userPublicMeta || '{}');
      } catch {
        throw new Error('JSON inválido em Public Metadata');
      }
      try {
        priv = JSON.parse(userPrivateMeta || '{}');
      } catch {
        throw new Error('JSON inválido em Private Metadata');
      }
      try {
        uns = JSON.parse(userUnsafeMeta || '{}');
      } catch {
        throw new Error('JSON inválido em Unsafe Metadata');
      }
      try {
        pref = JSON.parse(userPreferences || '{}');
      } catch {
        throw new Error('JSON inválido em Preferências');
      }

      const res = await fetch(`/api/admin/users/${inspectingUser.id}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicMetadata: pub,
          privateMetadata: priv,
          unsafeMetadata: uns,
          preferences: pref,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Falha ao salvar metadados');
      }

      toast.success('Metadados e preferências atualizados com sucesso!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSavingMeta(false);
    }
  };

  const revokeUserSessionMutation = useMutation({
    mutationFn: async (sessionToken: string) => {
      return (authClient.admin as any).revokeUserSession({ sessionToken });
    },
    onSuccess: () => {
      refetchUserSessions();
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Sessão do usuário revogada com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao revogar sessão.');
    },
  });

  // Revoke All User Sessions Mutation
  const revokeAllUserSessionsMutation = useMutation({
    mutationFn: async (userId: string) => {
      return (authClient.admin as any).revokeUserSessions({ userId });
    },
    onSuccess: () => {
      refetchUserSessions();
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Todas as sessões deste usuário foram revogadas.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao revogar sessões.');
    },
  });

  // Set User Password Mutation
  const setPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      return (authClient.admin as any).setUserPassword({ userId, newPassword });
    },
    onSuccess: () => {
      setNewPasswordForUser('');
      toast.success('Senha do usuário redefinida com sucesso.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao redefinir senha do usuário.');
    },
  });

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

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
                      <TableRow
                        key={u.id}
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setInspectingUser(u)}
                      >
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
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {/* Inspect Details Button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setInspectingUser(u)}
                              title="Inspecionar Usuário & Sessões"
                              className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                              <Eye className="size-3.5" />
                            </Button>

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

      {/* Modal / Drawer de Inspeção Completa do Usuário */}
      <Dialog open={Boolean(inspectingUser)} onOpenChange={(open) => !open && setInspectingUser(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {inspectingUser && (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold text-sm uppercase">
                      {inspectingUser.name?.[0] || inspectingUser.email?.[0] || 'U'}
                    </div>
                    <div>
                      <DialogTitle className="text-base font-bold text-foreground">
                        {inspectingUser.name || 'Sem nome cadastrado'}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground font-mono">
                        {inspectingUser.email}
                      </DialogDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={inspectingUser.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                      {inspectingUser.role || 'user'}
                    </Badge>
                    {inspectingUser.banned ? (
                      <Badge variant="destructive" className="text-xs">Suspenso</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-emerald-500 border-emerald-500/30">Ativo</Badge>
                    )}
                  </div>
                </div>
              </DialogHeader>

              {/* Tabs de Detalhes, Metadados e Sessões Ativas */}
              <Tabs defaultValue="info" className="w-full">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="info" className="text-xs">Identidade & Perfil</TabsTrigger>
                  <TabsTrigger value="metadata" className="text-xs">Metadados & Preferências</TabsTrigger>
                  <TabsTrigger value="sessions" className="text-xs">
                    Sessões ({userSessions.length})
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Informações de Identidade & Credenciais */}
                <TabsContent value="info" className="space-y-4 pt-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg border border-border/80 bg-muted/20 space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium">ID da Conta (D1)</span>
                      <div className="flex items-center justify-between font-mono text-xs">
                        <span className="truncate">{inspectingUser.id}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyId(inspectingUser.id)}
                          className="size-6 text-muted-foreground hover:text-foreground"
                          title="Copiar ID"
                        >
                          {copiedId ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                        </Button>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-border/80 bg-muted/20 space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium">Verificação de Email</span>
                      <div className="text-xs font-semibold">
                        {inspectingUser.emailVerified ? (
                          <span className="text-emerald-500 flex items-center gap-1">
                            <CheckCircle className="size-3.5" /> Verificado
                          </span>
                        ) : (
                          <span className="text-amber-500 flex items-center gap-1">
                            <ShieldAlert className="size-3.5" /> Não verificado
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-border/80 bg-muted/20 space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium">Username & Telefone</span>
                      <div className="text-xs font-medium space-y-0.5">
                        <div>@{inspectingUserMeta?.username || inspectingUser.username || 'não definido'}</div>
                        <div className="text-muted-foreground font-mono text-[11px]">{inspectingUserMeta?.phoneNumber || inspectingUser.phoneNumber || 'sem telefone'}</div>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-border/80 bg-muted/20 space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium">Idioma & Fuso Horário</span>
                      <div className="text-xs font-mono">
                        {inspectingUserMeta?.locale || 'en'} • {inspectingUserMeta?.timezone || 'UTC'}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-border/80 bg-muted/20 space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium">Data de Cadastro</span>
                      <div className="text-xs font-mono">{formatDate(inspectingUser.createdAt)}</div>
                    </div>

                    <div className="p-3 rounded-lg border border-border/80 bg-muted/20 space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium">2FA / TOTP</span>
                      <div className="text-xs font-semibold">
                        {inspectingUser.twoFactorEnabled ? (
                          <span className="text-emerald-500 flex items-center gap-1">
                            <CheckCircle className="size-3.5" /> Ativado
                          </span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1">Desativado</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Redefinição de Senha Direta pelo Administrador */}
                  <div className="p-4 rounded-lg border border-border/80 bg-card space-y-3">
                    <div className="flex items-center gap-2">
                      <KeyRound className="size-4 text-indigo-400" />
                      <h4 className="text-xs font-bold text-foreground">Redefinir Senha do Usuário</h4>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Define imediatamente uma nova senha para este usuário com hashing scrypt no Cloudflare D1.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="Digite a nova senha (mín. 8 caracteres)"
                        value={newPasswordForUser}
                        onChange={(e) => setNewPasswordForUser(e.target.value)}
                        className="text-xs h-8"
                      />
                      <Button
                        size="sm"
                        disabled={!newPasswordForUser || newPasswordForUser.length < 8 || setPasswordMutation.isPending}
                        onClick={() =>
                          setPasswordMutation.mutate({
                            userId: inspectingUser.id,
                            newPassword: newPasswordForUser,
                          })
                        }
                        className="h-8 text-xs shrink-0 font-semibold"
                      >
                        {setPasswordMutation.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          'Atualizar Senha'
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Ações de Impersonação e Suspensão */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => impersonateMutation.mutate(inspectingUser.id)}
                      disabled={impersonateMutation.isPending}
                      className="text-xs gap-1.5 text-indigo-400 hover:text-indigo-300 border-indigo-500/30"
                    >
                      <Sparkles className="size-3.5" />
                      <span>Personificar Conta</span>
                    </Button>

                    {inspectingUser.banned ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unbanMutation.mutate(inspectingUser.id)}
                        disabled={unbanMutation.isPending}
                        className="text-xs gap-1.5 text-emerald-400 hover:text-emerald-300 border-emerald-500/30"
                      >
                        <CheckCircle className="size-3.5" />
                        <span>Restaurar Acesso</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedUserForBan(inspectingUser)}
                        className="text-xs gap-1.5 text-amber-400 hover:text-amber-300 border-amber-500/30"
                      >
                        <Ban className="size-3.5" />
                        <span>Suspender Acesso</span>
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const nextRole = inspectingUser.role === 'admin' ? 'user' : 'admin';
                        setRoleMutation.mutate({ userId: inspectingUser.id, role: nextRole });
                      }}
                      disabled={setRoleMutation.isPending}
                      className="text-xs gap-1.5 text-sky-400 hover:text-sky-300 border-sky-500/30"
                    >
                      <Shield className="size-3.5" />
                      <span>{inspectingUser.role === 'admin' ? 'Rebaixar para User' : 'Promover para Admin'}</span>
                    </Button>
                  </div>
                </TabsContent>

                {/* Tab 2: Metadados em 3 Níveis (Padrão Clerk) */}
                <TabsContent value="metadata" className="space-y-4 pt-3">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-emerald-400">
                          Public Metadata (JSON)
                        </Label>
                        <Badge variant="outline" className="text-[10px]">Leitura: Client | Escrita: Backend</Badge>
                      </div>
                      <Textarea
                        rows={3}
                        value={userPublicMeta}
                        onChange={(e) => setUserPublicMeta(e.target.value)}
                        className="font-mono text-xs bg-muted/20"
                        placeholder='{"role": "editor", "plan": "pro"}'
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-indigo-400">
                          Private Metadata (JSON)
                        </Label>
                        <Badge variant="destructive" className="text-[10px]">Confidencial: Apenas Backend</Badge>
                      </div>
                      <Textarea
                        rows={3}
                        value={userPrivateMeta}
                        onChange={(e) => setUserPrivateMeta(e.target.value)}
                        className="font-mono text-xs bg-muted/20"
                        placeholder='{"stripeCustomerId": "cus_...", "internalId": "123"}'
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-amber-400">
                          Unsafe Metadata (JSON)
                        </Label>
                        <Badge variant="outline" className="text-[10px]">Leitura & Escrita: Client</Badge>
                      </div>
                      <Textarea
                        rows={3}
                        value={userUnsafeMeta}
                        onChange={(e) => setUserUnsafeMeta(e.target.value)}
                        className="font-mono text-xs bg-muted/20"
                        placeholder='{"theme": "dark", "onboardingCompleted": true}'
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-purple-400">
                          User Preferences (JSON)
                        </Label>
                        <Badge variant="outline" className="text-[10px]">Configurações & Notificações</Badge>
                      </div>
                      <Textarea
                        rows={3}
                        value={userPreferences}
                        onChange={(e) => setUserPreferences(e.target.value)}
                        className="font-mono text-xs bg-muted/20"
                        placeholder='{"emailNotifications": true, "theme": "dark"}'
                      />
                    </div>

                    <Button
                      size="sm"
                      onClick={handleSaveMetadata}
                      disabled={isSavingMeta}
                      className="w-full text-xs bg-indigo-600 hover:bg-indigo-500"
                    >
                      {isSavingMeta ? 'Salvando...' : 'Salvar Alterações de Metadados & Preferências'}
                    </Button>
                  </div>
                </TabsContent>

                {/* Tab 3: Sessões Ativas deste Usuário */}
                <TabsContent value="sessions" className="space-y-3 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {userSessions.length} {userSessions.length === 1 ? 'sessão ativa encontrada' : 'sessões ativas encontradas'}
                    </span>
                    {userSessions.length > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Revogar todas as sessões do usuário ${inspectingUser.email}?`)) {
                            revokeAllUserSessionsMutation.mutate(inspectingUser.id);
                          }
                        }}
                        disabled={revokeAllUserSessionsMutation.isPending}
                        className="text-xs h-7 gap-1"
                      >
                        <Trash2 className="size-3" />
                        <span>Revogar Todas</span>
                      </Button>
                    )}
                  </div>

                  {isLoadingSessions ? (
                    <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin text-indigo-500" />
                      <span>Carregando sessões...</span>
                    </div>
                  ) : userSessions.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                      Nenhuma sessão ativa encontrada para este usuário.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {userSessions.map((s: any) => {
                        const isExpired = new Date(s.expiresAt).getTime() < now;
                        return (
                          <div
                            key={s.id || s.token}
                            className="p-3 rounded-lg border border-border/80 bg-muted/30 flex items-center justify-between text-xs"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Laptop className="size-3.5 text-muted-foreground shrink-0" />
                                <span className="font-semibold text-foreground truncate max-w-xs">
                                  {s.userAgent || 'Navegador desconhecido'}
                                </span>
                                {isExpired ? (
                                  <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                                    Expirada
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 py-0 px-1.5">
                                    Ativa
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
                                <span>IP: {s.ipAddress || 'Não registrado'}</span>
                                <span>Expira: {formatDate(s.expiresAt)}</span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeUserSessionMutation.mutate(s.token)}
                              disabled={revokeUserSessionMutation.isPending}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7 shrink-0"
                            >
                              Revogar
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <DialogFooter className="pt-2 border-t border-border/60">
                <Button variant="outline" size="sm" onClick={() => setInspectingUser(null)}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
