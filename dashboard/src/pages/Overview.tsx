import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { authClient } from "@/lib/auth-client";
import { Header } from "@/components/Header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from "@/components/UI";
import {
  Users,
  Building2,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  FileCode2,
  KeyRound,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

export function Overview() {
  // Query users count and overview
  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["admin", "users", { limit: 10 }],
    queryFn: async () => {
      const res = await (authClient.admin as any).listUsers({
        query: { limit: 10 },
      });
      return res.data;
    },
  });

  // Query health endpoint
  const { data: healthData } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("/health");
      return res.json();
    },
  });

  const totalUsers = usersData?.total || usersData?.users?.length || 0;
  const recentUsers = usersData?.users?.slice(0, 5) || [];

  return (
    <div>
      <Header
        title="Visão Geral"
        description="Métricas em tempo real, integridade do engine e atalhos rápidos"
      />

      <div className="p-8 space-y-8">
        {/* Stat Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Total Users */}
          <Card className="hover:border-cyan-500/40 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Usuários Totais
                </span>
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">
                  {isLoadingUsers ? "..." : totalUsers}
                </span>
                <span className="text-xs text-emerald-400 font-medium">Contas no D1</span>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <Link
                  href="/users"
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 group"
                >
                  <span>Gerenciar contas</span>
                  <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Organizations */}
          <Card className="hover:border-cyan-500/40 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Multi-Tenancy
                </span>
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">Ativo</span>
                <span className="text-xs text-slate-400 font-medium">RBAC + Equipes</span>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <Link
                  href="/organizations"
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 group"
                >
                  <span>Ver organizações</span>
                  <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Security & 2FA */}
          <Card className="hover:border-cyan-500/40 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Módulos de Auth
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">7 Plugados</span>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  Passkeys, 2FA, MagicLink, JWKS
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Edge Architecture */}
          <Card className="hover:border-cyan-500/40 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Infraestrutura
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">Cloudflare</span>
                <span className="text-xs text-amber-400 font-medium">Workers + D1</span>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  Status: {healthData?.status === "healthy" ? "100% Operacional" : "Ativo"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* System Features & Quick Developer Hub */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Access Card */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recursos & Métodos Ativos</CardTitle>
                <CardDescription>
                  Plugins nativos inicializados pelo Better Auth Engine neste runtime
                </CardDescription>
              </div>
              <Badge variant="info">Plug-and-play</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200">Email & Senha com Hash Seguro</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Protegido contra timing attacks e validação criptográfica.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200">Passkeys / WebAuthn FIDO2</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      TouchID, FaceID e Windows Hello sem senhas.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200">Autenticação 2FA (TOTP)</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Códigos de 6 dígitos via Authenticator e chaves de recuperação.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200">Magic Link Passwordless</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Acesso direto por link via Resend ou console local.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200">Multi-Tenancy & Organizações</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Criação de times, convites e controle de papéis (RBAC).
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200">Validação Offline via JWKS</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Microsserviços validam tokens sem consultar o banco D1.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Developer Quick Links Card */}
          <Card>
            <CardHeader>
              <CardTitle>Endpoints do Engine</CardTitle>
              <CardDescription>Documentação e chaves criptográficas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between group transition-colors block"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <FileCode2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors">
                      Swagger UI Interativo
                    </div>
                    <div className="text-[11px] text-slate-500">Testar endpoints via navegador</div>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
              </a>

              <a
                href="/.well-known/jwks.json"
                target="_blank"
                rel="noreferrer"
                className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between group transition-colors block"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors">
                      Chaves Públicas (JWKS)
                    </div>
                    <div className="text-[11px] text-slate-500">/.well-known/jwks.json</div>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
              </a>

              <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-950/30 to-slate-900 border border-cyan-800/30 mt-4">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Dica de Integração</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Para conectar qualquer app React/Vue ao Edgekit Auth, utilize o client tipado pré-configurado em{" "}
                  <code className="text-cyan-300 font-mono">src/lib/auth-client.ts</code>.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
