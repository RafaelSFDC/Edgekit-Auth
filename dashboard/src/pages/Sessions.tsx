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
} from "@/components/UI";
import { formatDate } from "@/lib/utils";
import {
  ShieldCheck,
  Laptop,
  Smartphone,
  Globe,
  KeyRound,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle,
} from "lucide-react";

export function Sessions() {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);

  // Current session info
  const { data: sessionData } = authClient.useSession();

  // List active sessions for the current user
  const { data: sessionsData, isLoading } = useQuery({
    queryKey: ["user", "sessions"],
    queryFn: async () => {
      const res = await authClient.listSessions();
      return res.data || [];
    },
  });

  const sessions = sessionsData || [];

  // Revoke single session mutation
  const revokeSessionMutation = useMutation({
    mutationFn: async (token: string) => {
      return authClient.revokeSession({ token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", "sessions"] });
      setFeedback("Sessão revogada com sucesso.");
    },
  });

  // Revoke other sessions mutation
  const revokeOthersMutation = useMutation({
    mutationFn: async () => {
      return authClient.revokeOtherSessions();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", "sessions"] });
      setFeedback("Todas as outras sessões ativas foram desconectadas.");
    },
  });

  return (
    <div>
      <Header
        title="Sessões & Auditoria"
        description="Monitoramento de dispositivos conectados, expiração de tokens e revogação de acessos"
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
              <span>Sessões Ativas no Dispositivo</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Revogue sessões suspeitas ou desconecte outros dispositivos com um clique.
            </p>
          </div>

          <Button
            variant="danger"
            size="sm"
            onClick={() => revokeOthersMutation.mutate()}
            isLoading={revokeOthersMutation.isPending}
            disabled={sessions.length <= 1}
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            <span>Desconectar Outros Aparelhos</span>
          </Button>
        </div>

        {/* Sessions List */}
        <Card>
          <div className="divide-y divide-slate-800/60">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mx-auto mb-2" />
                Carregando sessões...
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                Nenhuma outra sessão ativa encontrada.
              </div>
            ) : (
              sessions.map((sess: any) => {
                const isCurrent = sess.token === sessionData?.session?.token;
                const isMobile = sess.userAgent?.toLowerCase().includes("mobile");

                return (
                  <div
                    key={sess.id || sess.token}
                    className="p-5 flex items-center justify-between hover:bg-slate-800/20 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 shrink-0">
                        {isMobile ? <Smartphone className="w-5 h-5" /> : <Laptop className="w-5 h-5" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-200">
                            {sess.userAgent?.split(" ")[0] || "Dispositivo Web"}
                          </span>
                          {isCurrent && (
                            <Badge variant="success" className="text-[10px]">
                              Esta Sessão
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                          <span className="flex items-center gap-1">
                            <Globe className="w-3.5 h-3.5 text-slate-500" />
                            IP: {sess.ipAddress || "Localhost"}
                          </span>
                          <span>•</span>
                          <span>Criado: {formatDate(sess.createdAt)}</span>
                          <span>•</span>
                          <span>Expira: {formatDate(sess.expiresAt)}</span>
                        </div>
                      </div>
                    </div>

                    {!isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeSessionMutation.mutate(sess.token)}
                        className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      >
                        Revogar
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Offline Token Info Card */}
        <Card className="bg-slate-900/40 border-slate-800/80">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>Validação Criptográfica Assíncrona (JWKS)</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Como seus outros microsserviços validam as sessões emitidas pelo Edgekit Auth
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              O Edgekit Auth assina tokens JWT com uma chave privada e expõe a chave pública correspondente no
              endpoint padrão <code className="text-amber-300 font-mono">/.well-known/jwks.json</code>. Seus
              backends em Node, Go, Rust ou Python podem fazer o download e cache dessas chaves para validar a
              assinatura dos tokens offline sem sobrecarregar o banco de dados Cloudflare D1.
            </p>
            <div className="pt-2">
              <a
                href="/.well-known/jwks.json"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-cyan-400 hover:text-cyan-300 font-mono underline inline-block"
              >
                Abrir /.well-known/jwks.json no navegador ↗
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
