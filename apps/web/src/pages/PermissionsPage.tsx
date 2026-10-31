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
  ShieldCheck,
  Plus,
  Key,
  Settings,
  Trash2,
} from 'lucide-react';

export const PermissionsPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isPermModalOpen, setIsPermModalOpen] = useState(false);
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState<any | null>(null);

  const [newRole, setNewRole] = useState({ key: '', name: '', description: '', scope: 'global' });
  const [newPerm, setNewPerm] = useState({ key: '', name: '', description: '', category: 'Geral' });

  // 1. Fetch roles
  const { data: rolesData, isLoading: _isLoadingRoles } = useQuery({
    queryKey: ['admin', 'rbac', 'roles'],
    queryFn: async () => {
      const res = await fetch('/api/admin/rbac/roles');
      if (!res.ok) return { roles: [] };
      return res.json();
    },
  });

  // 2. Fetch permissions
  const { data: permsData, isLoading: _isLoadingPerms } = useQuery({
    queryKey: ['admin', 'rbac', 'permissions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/rbac/permissions');
      if (!res.ok) return { permissions: [] };
      return res.json();
    },
  });

  const roles: any[] = rolesData?.roles || [];
  const permissions: any[] = permsData?.permissions || [];

  // Create role mutation
  const createRoleMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/admin/rbac/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Falha ao criar papel');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'rbac', 'roles'] });
      toast.success('Papel (Role) criado com sucesso!');
      setIsRoleModalOpen(false);
      setNewRole({ key: '', name: '', description: '', scope: 'global' });
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  // Create permission mutation
  const createPermMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/admin/rbac/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Falha ao criar permissão');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'rbac', 'permissions'] });
      toast.success('Permissão atômica criada com sucesso!');
      setIsPermModalOpen(false);
      setNewPerm({ key: '', name: '', description: '', category: 'Geral' });
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  // Update role permissions mutation
  const updateRolePermsMutation = useMutation({
    mutationFn: async ({ roleId, permissions }: { roleId: string; permissions: string[] }) => {
      const res = await fetch(`/api/admin/rbac/roles/${roleId}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar permissões do papel');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'rbac', 'roles'] });
      toast.success('Permissões do papel atualizadas!');
      setSelectedRoleForEdit(null);
    },
  });

  // Delete role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/rbac/roles/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao remover papel');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'rbac', 'roles'] });
      toast.success('Papel removido.');
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  return (
    <PageLayout>
      <PageHeader
        title="Permissões & RBAC"
        description="Configure papéis (roles), permissões atômicas e regras de autorização granulares (FGA) para consumidores e organizações."
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsPermModalOpen(true)} className="gap-1.5">
            <Key className="size-4 text-emerald-500" /> Nova Permissão
          </Button>
          <Button size="sm" onClick={() => setIsRoleModalOpen(true)} className="gap-1.5 bg-indigo-600 hover:bg-indigo-500">
            <Plus className="size-4" /> Novo Papel (Role)
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Catálogo de Papéis (Roles) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="size-5 text-indigo-500" /> Papéis Ativos (Roles)
            </CardTitle>
            <CardDescription>
              Papéis agrupam conjuntos de permissões e são injetados automaticamente no token JWT via claims.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Papel</TableHead>
                  <TableHead>Identificador (Key)</TableHead>
                  <TableHead>Escopo</TableHead>
                  <TableHead>Permissões</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhum papel customizado cadastrado ainda.
                    </TableCell>
                  </TableRow>
                ) : (
                  roles.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{r.name}</span>
                          {r.isSystem && (
                            <Badge variant="outline" className="text-[10px]">Sistema</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.key}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-xs">
                          {r.scope}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(r.permissions || []).slice(0, 3).map((p: string) => (
                            <Badge key={p} variant="outline" className="text-[10px] bg-muted/30 font-mono">
                              {p}
                            </Badge>
                          ))}
                          {(r.permissions || []).length > 3 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{(r.permissions || []).length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => setSelectedRoleForEdit(r)}
                          >
                            <Settings className="size-3.5 mr-1" /> Permissões
                          </Button>
                          {!r.isSystem && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:bg-destructive/10"
                              onClick={() => deleteRoleMutation.mutate(r.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Permissões Atômicas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="size-5 text-emerald-500" /> Permissões Atômicas
            </CardTitle>
            <CardDescription>
              Ações pontuais verificadas offline no backend (ex: posts:create).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {permissions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhuma permissão atômica cadastrada.
              </p>
            ) : (
              permissions.map((p) => (
                <div key={p.id} className="p-2.5 rounded-lg border bg-muted/20 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-emerald-400">{p.key}</span>
                    <Badge variant="secondary" className="text-[10px]">{p.category}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.name}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal: Novo Papel */}
      <Dialog open={isRoleModalOpen} onOpenChange={setIsRoleModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Papel (Role)</DialogTitle>
            <DialogDescription>
              Defina um papel que será atribuído a consumidores globais ou membros de organizações.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome Amigável</Label>
              <Input
                placeholder="Ex: Gerente Financeiro"
                value={newRole.name}
                onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Chave Identificadora (Key)</Label>
              <Input
                placeholder="Ex: finance_manager"
                value={newRole.key}
                onChange={(e) => setNewRole({ ...newRole, key: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input
                placeholder="Responsável por pagamentos e relatórios"
                value={newRole.description}
                onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleModalOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createRoleMutation.mutate(newRole)}
              disabled={!newRole.name || !newRole.key || createRoleMutation.isPending}
            >
              Criar Papel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Nova Permissão */}
      <Dialog open={isPermModalOpen} onOpenChange={setIsPermModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Permissão Atômica</DialogTitle>
            <DialogDescription>
              Defina uma capacidade atômica verificável por backends (ex: invoices:delete).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Chave (Key)</Label>
              <Input
                placeholder="Ex: invoices:create"
                value={newPerm.key}
                onChange={(e) => setNewPerm({ ...newPerm, key: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Nome Amigável</Label>
              <Input
                placeholder="Ex: Emitir Faturas"
                value={newPerm.name}
                onChange={(e) => setNewPerm({ ...newPerm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Input
                placeholder="Ex: Financeiro"
                value={newPerm.category}
                onChange={(e) => setNewPerm({ ...newPerm, category: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPermModalOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createPermMutation.mutate(newPerm)}
              disabled={!newPerm.key || !newPerm.name || createPermMutation.isPending}
            >
              Criar Permissão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Permissões do Papel */}
      {selectedRoleForEdit && (
        <Dialog open={Boolean(selectedRoleForEdit)} onOpenChange={() => setSelectedRoleForEdit(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Permissões de {selectedRoleForEdit.name}</DialogTitle>
              <DialogDescription>
                Selecione quais permissões atômicas pertencem a este papel.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-64 overflow-y-auto space-y-2 py-2">
              {permissions.map((p) => {
                const isChecked = (selectedRoleForEdit.permissions || []).includes(p.key);
                return (
                  <label
                    key={p.id}
                    htmlFor={`perm-check-${p.id}`}
                    aria-label={p.name}
                    className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/40 cursor-pointer"
                  >
                    <div>
                      <p className="text-xs font-semibold">{p.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{p.key}</p>
                    </div>
                    <input
                      id={`perm-check-${p.id}`}
                      type="checkbox"
                      checked={isChecked}
                      className="size-4 accent-indigo-600 rounded"
                      onChange={(e) => {
                        const current = selectedRoleForEdit.permissions || [];
                        const updated = e.target.checked
                          ? [...current, p.key]
                          : current.filter((k: string) => k !== p.key);
                        setSelectedRoleForEdit({ ...selectedRoleForEdit, permissions: updated });
                      }}
                    />
                  </label>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedRoleForEdit(null)}>Fechar</Button>
              <Button
                onClick={() =>
                  updateRolePermsMutation.mutate({
                    roleId: selectedRoleForEdit.id,
                    permissions: selectedRoleForEdit.permissions || [],
                  })
                }
              >
                Salvar Alterações
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageLayout>
  );
};
