import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { authClient } from "@/lib/auth-client";
import { Sidebar } from "./Sidebar";
import { ShieldAlert, LogOut, Loader2 } from "lucide-react";
import { Button } from "./UI";

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const [, setLocation] = useLocation();
  const { data: session, isPending, error } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session?.user) {
      setLocation("/login");
    }
  }, [isPending, session, setLocation]);

  if (isPending) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Validando credenciais do console...</p>
      </div>
    );
  }

  if (!session?.user) {
    return null; // Will redirect via useEffect
  }

  // Check if role is admin
  const userRole = (session.user as any).role;
  if (userRole !== "admin") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4 shadow-xl">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Acesso Restrito ao Console</h2>
        <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
          Você está conectado como <strong className="text-slate-200">{session.user.email}</strong>,
          mas esta conta possui o papel de <code className="text-rose-400 font-mono">user</code> e não
          possui privilégios de <code className="text-cyan-400 font-mono">admin</code>.
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={async () => {
              await authClient.signOut();
              setLocation("/login");
            }}
          >
            <LogOut className="w-4 h-4 mr-1.5" />
            Entrar com outra conta
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto max-h-screen flex flex-col">
        {children}
      </main>
    </div>
  );
}
