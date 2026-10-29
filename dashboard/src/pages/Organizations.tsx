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
} from "lucide-react";

export function Organizations() {
  const queryClient = useQueryClient();
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: "", slug: "" });
  const [invite, setInvite] = useState({ email: "", role: "member" });
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // List user's organizations
  const { data: orgsData, isLoading: isLoadingOrgs } = useQuery({
    queryKey: ["organizations", "list"],
    queryFn: async () => {
      const res = await authClient.organization.list();
      return res.data || [];
    },
  });

  const organizations = orgsData || [];
  const activeOrgId = selectedOrgId || organizations[0]?.id;

  // Get full organization data (including members and invitations)
  const { data: fullOrgData, isLoading: isLoadingFullOrg } = useQuery({
    queryKey: ["organization", "full", activeOrgId],
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
        slug: data.slug || data.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      });
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setIsCreateOrgModalOpen(false);
      setNewOrg({ name: "", slug: "" });
      if (res?.data?.id) setSelectedOrgId(res.data.id);
      setFeedback("Organização criada com sucesso!");
    },
  });

  // Invite Member Mutation
  const inviteMemberMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      if (!activeOrgId) throw new Error("Selecione uma organização.");
      return authClient.organization.inviteMember({
        email,
        role: role as any,
        organizationId: activeOrgId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", "full", activeOrgId] });
      setIsInviteModalOpen(false);
      setInvite({ email: "", role: "member" });
      setFeedback("Convite de organização enviado com sucesso!");
    },
  });

  // Remove Member Mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (memberIdOrEmail: string) => {
      if (!activeOrgId) throw new Error("Selecione uma organização.");
      return authClient.organization.removeMember({
        memberIdOrEmail,
        organizationId: activeOrgId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", "full", activeOrgId] });
      setFeedback("Membro removido da organização.");
    },
  });

  return (
    <div>
      <Header
        title="Multi-Tenancy & Organizações"
        description="Gestão de workspaces, membros de equipes, convites e controle de papéis (RBAC)"
      />

      <div className="p-8 space-y-6">
        {feedback && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
            <span>{feedback}</span>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Top Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Workspaces Cadastrados</h2>
          </div>

          <Button variant="primary" size="md" onClick={() => setIsCreateOrgModalOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            <span>Nova Organização</span>
          </Button>
        </div>

        {/* Organizations List / Selector */}
        {isLoadingOrgs ? (
          <Card className="p-8 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mx-auto mb-2" />
            Carregando organizações...
          </Card>
        ) : organizations.length === 0 ? (
          <Card className="p-12 text-center">
            <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-200">Nenhuma organização criada</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
              O plugin multi-tenant do Better Auth permite agrupar usuários em equipes com cargos como
              owner, admin e member.
            </p>
            <Button variant="primary" size="md" onClick={() => setIsCreateOrgModalOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              <span>Criar Primeira Organização</span>
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {organizations.map((org: any) => {
              const isSelected = org.id === activeOrgId;
              return (
                <div
                  key={org.id}
                  onClick={() => setSelectedOrgId(org.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? "bg-indigo-950/30 border-indigo-500/50 shadow-lg shadow-indigo-500/10"
                      : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-sm">
                        {org.name[0]?.toUpperCase() || "O"}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-slate-200">{org.name}</h4>
                        <span className="text-xs text-slate-500 font-mono">@{org.slug}</span>
                      </div>
                    </div>
                    {isSelected && (
                      <Badge variant="info" className="text-[10px]">
                        Ativa
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Selected Organization Details & Members */}
        {activeOrgId && (
          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span>Membros da Equipe</span>
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {fullOrgData?.members?.length || 0} membros
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Permissões de acesso baseadas em papéis (RBAC) para esta organização
                </CardDescription>
              </div>

              <Button variant="secondary" size="sm" onClick={() => setIsInviteModalOpen(true)}>
                <UserPlus className="w-4 h-4 mr-1.5 text-cyan-400" />
                <span>Convidar Membro</span>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-6 py-3.5">Membro</th>
                      <th className="px-6 py-3.5">Papel (Role)</th>
                      <th className="px-6 py-3.5">Data de Entrada</th>
                      <th className="px-6 py-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {isLoadingFullOrg ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                          <Loader2 className="w-5 h-5 animate-spin text-cyan-400 mx-auto mb-2" />
                          Carregando membros...
                        </td>
                      </tr>
                    ) : (fullOrgData?.members || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                          Nenhum membro registrado além do criador.
                        </td>
                      </tr>
                    ) : (
                      fullOrgData?.members?.map((member: any) => {
                        const isOwner = member.role === "owner";
                        const isAdmin = member.role === "admin";

                        return (
                          <tr key={member.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-semibold text-xs">
                                  {member.user?.name?.[0]?.toUpperCase() ||
                                    member.user?.email?.[0]?.toUpperCase() ||
                                    "M"}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-200">
                                    {member.user?.name || "Sem Nome"}
                                  </p>
                                  <p className="text-xs text-slate-400 font-mono">
                                    {member.user?.email}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <Badge
                                variant={isOwner ? "warning" : isAdmin ? "info" : "secondary"}
                                className="flex items-center gap-1 w-fit"
                              >
                                {isOwner && <Crown className="w-3 h-3 text-amber-400" />}
                                {isAdmin && <Shield className="w-3 h-3 text-cyan-400" />}
                                <span>{member.role}</span>
                              </Badge>
                            </td>

                            <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                              {formatDate(member.createdAt)}
                            </td>

                            <td className="px-6 py-4 text-right">
                              {!isOwner && (
                                <button
                                  onClick={() => removeMemberMutation.mutate(member.id)}
                                  className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                                  title="Remover membro da organização"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Modal: Create Organization */}
        <Modal
          isOpen={isCreateOrgModalOpen}
          onClose={() => setIsCreateOrgModalOpen(false)}
          title="Nova Organização"
          description="Crie um novo workspace multi-tenant no sistema."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createOrgMutation.mutate(newOrg);
            }}
            className="space-y-3.5 pt-2"
          >
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Nome da Organização / Empresa
              </label>
              <Input
                required
                placeholder="Ex: Acme Corporation"
                value={newOrg.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setNewOrg({
                    name,
                    slug: name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
                  });
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Slug URL</label>
              <Input
                required
                placeholder="acme-corp"
                value={newOrg.slug}
                onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <Button variant="secondary" size="md" type="button" onClick={() => setIsCreateOrgModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" size="md" type="submit" isLoading={createOrgMutation.isPending}>
                Criar Organização
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal: Invite Member */}
        <Modal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          title="Convidar Membro para a Organização"
          description="Envie um convite de acesso para o e-mail do colaborador."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              inviteMemberMutation.mutate(invite);
            }}
            className="space-y-3.5 pt-2"
          >
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">E-mail do Convidado</label>
              <Input
                type="email"
                required
                placeholder="colaborador@empresa.com"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Cargo Inicial</label>
              <select
                value={invite.role}
                onChange={(e) => setInvite({ ...invite, role: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="member">Member (Membro padrão)</option>
                <option value="admin">Admin (Gestor da Organização)</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <Button variant="secondary" size="md" type="button" onClick={() => setIsInviteModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" size="md" type="submit" isLoading={inviteMemberMutation.isPending}>
                Enviar Convite
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  );
}
