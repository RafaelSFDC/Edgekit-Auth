import React, { useState } from "react";
import { useLocation } from "wouter";
import { authClient } from "@/lib/auth-client";
import { Zap, KeyRound, Mail, Lock, ArrowRight, ShieldCheck, Fingerprint } from "lucide-react";
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/UI";

export function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await authClient.signIn.email({
        email,
        password,
      });

      if (res.error) {
        setErrorMsg(res.error.message || "Credenciais inválidas. Verifique seu email e senha.");
        setIsLoading(false);
        return;
      }

      // Check user session
      const session = await authClient.getSession();
      if ((session?.data?.user as any)?.role !== "admin") {
        setErrorMsg("Atenção: Esta conta foi autenticada, mas não possui permissão de 'admin'.");
        setIsLoading(false);
        return;
      }

      setLocation("/");
    } catch (err: any) {
      setErrorMsg(err.message || "Erro inesperado ao conectar à API.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await (authClient as any).signIn.passkey();
      if (res?.error) {
        setErrorMsg(res.error.message || "Falha na autenticação via Passkey.");
      } else {
        setLocation("/");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Passkey cancelada ou não suportada neste dispositivo.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setErrorMsg("Informe seu email para receber o Magic Link.");
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await authClient.signIn.magicLink({
        email,
        callbackURL: window.location.origin,
      });
      if (res.error) {
        setErrorMsg(res.error.message || "Falha ao enviar Magic Link.");
      } else {
        setMagicLinkSent(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao solicitar Magic Link.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background radial gradient decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-cyan-400 mx-auto flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/30 mb-3.5">
            <Zap className="w-6 h-6 fill-slate-950 stroke-slate-950" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Edgekit Auth Console</h1>
          <p className="text-sm text-slate-400 mt-1">Acesso exclusivo para administradores de sistema</p>
        </div>

        <Card className="bg-slate-900/80 border-slate-800 shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Identifique-se</CardTitle>
            <CardDescription className="text-xs">
              Entre com sua conta administrativa ou utilize biometria (Passkey).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
                <span className="font-bold text-sm">✕</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {magicLinkSent && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <span>Magic Link enviado! Verifique sua caixa de entrada (ou console local em dev).</span>
              </div>
            )}

            <form onSubmit={handleEmailSignIn} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email de Administrador
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="email"
                    required
                    placeholder="admin@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isLoading}
                className="w-full mt-2"
              >
                <span>Acessar Console</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </form>

            <div className="relative my-4 flex items-center justify-center">
              <div className="border-t border-slate-800 w-full absolute" />
              <span className="bg-slate-900 px-3 text-[11px] text-slate-500 relative uppercase font-semibold">
                ou utilize
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handlePasskeySignIn}
                disabled={isLoading}
                className="w-full"
              >
                <Fingerprint className="w-4 h-4 text-cyan-400 mr-1.5" />
                <span>Passkey</span>
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleMagicLink}
                disabled={isLoading}
                className="w-full"
              >
                <KeyRound className="w-4 h-4 text-amber-400 mr-1.5" />
                <span>Magic Link</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-600 mt-6 font-mono">
          Edgekit Auth Engine • Powered by Better Auth & Cloudflare Workers
        </p>
      </div>
    </div>
  );
}
