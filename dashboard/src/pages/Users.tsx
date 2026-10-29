import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { Header } from "@/components/Header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Input,
  Modal,
} from "@/components/UI";
import { formatDate } from "@/lib/utils";
import {
  Search,
  UserPlus,
  Shield,
  ShieldAlert,
  Ban,
  CheckCircle,
  Eye,
  KeyRound,
  MoreVertical,
  Loader2,
  Trash2,
  Sparkles,
} from "lucide-react";

export function Users() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserForBan, setSelectedUserForBan] = useState<any | null>(null);
  const [banReason, setBanReason] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "user" });
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Fetch users from Better Auth Admin API
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "users", searchTerm],
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
        banReason: reason || "Suspenso pelo Administrador do Console",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setSelectedUserForBan(null);
      setBanReason("");
      setActionFeedback({ type: "success", message: "Usuário suspenso com sucesso." });
    },
    onError: (err: any) => {
      setActionFeedback({ type: "error", message: err.message || "Erro ao suspender usuário." });
    },
  });

  // Unban Mutation
  const unbanMutation = useMutation({
    mutationFn: async (userId: string) => {
      return (authClient.admin as any).unbanUser({ userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setActionFeedback({ type: "success", message: "Suspensão removida com sucesso." });
    },
  });

  // Set Role Mutation
  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return (authClient.admin as any).setRole({ userId, role });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setActionFeedback({
        type: "success",
        message: `Cargo do usuário atualizado para '${variables.role}'.`,
      });
    },
  });

  // Impersonate Mutation
  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      return (authClient.admin as any).impersonateUser({ userId });
    },
    onSuccess: () => {
      setActionFeedback({
        type: "success",
        message: "Sessão assumida com sucesso! Redirecionando...",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 800);
    },
  });

  // Revoke Sessions Mutation
  const revokeSessionsMutation = useMutation({
    mutationFn: async (userId: string) => {
      return (authClient.admin as any).revokeUserSessions({ userId });
    },
    onSuccess: () => {
      setActionFeedback({ type: "success", message: "Todas as sessões do usuário foram revogadas." });
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
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setIsCreateModalOpen(false);
      setNewUser({ name: "", email: "", password: "", role: "user" });
      setActionFeedback({ type: "success", message: "Novo usuário criado com sucesso." });
    },
    onError: (err: any) => {
      setActionFeedback({ type: "error", message: err.message || "Erro ao criar usuário." });
    },
  });

  return (
    <div>
      <Header
        title="Gestão de Usuários"
        description="Listagem completa de contas, moderação, atribuição de cargos e impersonation"
      />

      <div className="p-8 space-y-6">
        {/* Feedback alert */}
        {actionFeedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
              actionFeedback.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/20 text-rose-300"
            }`}
          >
            <span>{actionFeedback.message}</span>
            <button
              onClick={() => setActionFeedback(null)}
              className="text-slate-400 hover:text-white ml-4 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Buscar por nome ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <Button variant="primary" size="md" onClick={() => setIsCreateModalOpen(true)}>
            <UserPlus className="w-4 h-4 mr-1.5" />
            <span>Novo Usuário</span>
          </Button>
        </div>

        {/* Users Table */}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">Usuário</th>
                  <th className="px-6 py-4">Cargo (Role)</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">2FA</th>
                  <th className="px-6 py-4">Criado em</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mx-auto mb-2" />
                      <span>Carregando usuários do D1...</span>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const isBanned = user.banned;
                    const isAdmin = user.role === "admin";

                    return (
                      <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                        {/* User Profile */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 font-semibold text-xs shrink-0">
                              {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-200 truncate">{user.name || "Sem Nome"}</p>
                              <p className="text-xs text-slate-400 font-mono truncate">{user.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-6 py-4">
                          <button
                            onClick={() =>
                              roleMutation.mutate({
                                userId: user.id,
                                role: isAdmin ? "user" : "admin",
                              })
                            }
                            title="Clique para alternar entre admin e user"
                            className="group flex items-center gap-1.5"
                          >
                            <Badge variant={isAdmin ? "info" : "secondary"}>
                              {isAdmin && <Shield className="w-3 h-3 text-cyan-400" />}
                              <span>{user.role || "user"}</span>
                            </Badge>
                          </button>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          {isBanned ? (
                            <Badge variant="danger" className="flex items-center gap-1">
                              <Ban className="w-3 h-3" />
                              <span>Banido</span>
                            </Badge>
                          ) : (
                            <Badge variant="success" className="flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              <span>Ativo</span>
                            </Badge>
                          )}
                        </td>

                        {/* 2FA */}
                        <td className="px-6 py-4">
                          {user.twoFactorEnabled ? (
                            <Badge variant="success" className="text-[11px]">
                              Ativado
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-500 font-mono">Não ativo</span>
                          )}
                        </td>

                        {/* Created At */}
                        <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                          {formatDate(user.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Impersonate button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Assumir sessão deste usuário (Impersonate)"
                              onClick={() => impersonateMutation.mutate(user.id)}
                              isLoading={impersonateMutation.isPending}
                            >
                              <Eye className="w-4 h-4 text-cyan-400 mr-1" />
                              <span className="text-xs">Impersonar</span>
                            </Button>

                            {/* Ban / Unban button */}
                            {isBanned ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => unbanMutation.mutate(user.id)}
                                isLoading={unbanMutation.isPending}
                                className="text-emerald-400 hover:text-emerald-300"
                              >
                                Reativar
                              </Button>
                            ) : (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setSelectedUserForBan(user)}
                              >
                                Suspender
                              </Button>
                            )}

                            {/* Revoke Sessions */}
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Revogar todas as sessões ativas do usuário"
                              onClick={() => revokeSessionsMutation.mutate(user.id)}
                            >
                              <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Modal: Confirm Ban */}
        <Modal
          isOpen={!!selectedUserForBan}
          onClose={() => setSelectedUserForBan(null)}
          title="Confirmar Suspensão de Conta"
          description={`Você está prestes a banir o acesso de ${selectedUserForBan?.email}.`}
        >
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Motivo da Suspensão (Opcional)
              </label>
              <Input
                placeholder="Ex: Violação dos termos de uso, atividade suspeita..."
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" size="md" onClick={() => setSelectedUserForBan(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="md"
                isLoading={banMutation.isPending}
                onClick={() =>
                  banMutation.mutate({
                    userId: selectedUserForBan.id,
                    reason: banReason,
                  })
                }
              >
                Confirmar Suspensão
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modal: Create User */}
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Criar Novo Usuário"
          description="Cadastre um novo usuário manualmente no Cloudflare D1."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createUserMutation.mutate(newUser);
            }}
            className="space-y-3.5 pt-2"
          >
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Nome Completo</label>
              <Input
                required
                placeholder="Ex: Maria Santos"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Email</label>
              <Input
                type="email"
                required
                placeholder="maria@empresa.com"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Senha Inicial</label>
              <Input
                type="password"
                required
                placeholder="••••••••••••"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Cargo Inicial</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="user">User (Padrão)</option>
                <option value="admin">Admin (Acesso ao Console)</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <Button variant="secondary" size="md" type="button" onClick={() => setIsCreateModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" size="md" type="submit" isLoading={createUserMutation.isPending}>
                Criar Usuário
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  );
}
