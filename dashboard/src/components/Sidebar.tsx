import React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Building2,
  ShieldCheck,
  FileCode2,
  KeyRound,
  Activity,
  LogOut,
  Zap,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Badge } from "./UI";

export function Sidebar() {
  const [location] = useLocation();
  const { data: session } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  const navItems = [
    { href: "/", label: "Visão Geral", icon: LayoutDashboard },
    { href: "/users", label: "Usuários", icon: Users },
    { href: "/organizations", label: "Organizações", icon: Building2 },
    { href: "/sessions", label: "Sessões & Tokens", icon: ShieldCheck },
  ];

  return (
    <aside className="w-64 border-r border-slate-800/80 bg-slate-950/80 backdrop-blur-xl flex flex-col justify-between h-screen sticky top-0 shrink-0">
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/60">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-cyan-400 flex items-center justify-center text-slate-950 shadow-md shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              <Zap className="w-5 h-5 fill-slate-950 stroke-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-white">Edgekit Auth</span>
                <Badge variant="info" className="text-[10px] px-1.5 py-0">Console</Badge>
              </div>
              <span className="text-[11px] text-slate-500 font-mono block">v0.2.0 • Cloudflare D1</span>
            </div>
          </Link>
        </div>

        {/* Navigation Items */}
        <div className="p-3">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Gerenciamento
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-cyan-500/10 text-cyan-400 font-semibold border border-cyan-500/20"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-400"}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Developer Endpoints Section */}
          <div className="mt-6 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Desenvolvedor
          </div>
          <div className="space-y-1 text-xs">
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 transition-colors"
            >
              <FileCode2 className="w-4 h-4 text-emerald-400" />
              <span>Swagger UI (/docs)</span>
            </a>
            <a
              href="/.well-known/jwks.json"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 transition-colors"
            >
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>JWKS Endpoint</span>
            </a>
            <a
              href="/health"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 transition-colors"
            >
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>API Health Check</span>
            </a>
          </div>
        </div>
      </div>

      {/* Admin User Footer Profile */}
      <div className="p-3 border-t border-slate-800/60 bg-slate-950/40">
        <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300 font-semibold text-xs shrink-0">
              {session?.user?.name?.[0]?.toUpperCase() || session?.user?.email?.[0]?.toUpperCase() || "A"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">
                {session?.user?.name || "Administrador"}
              </p>
              <p className="text-[11px] text-slate-500 truncate">{session?.user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            title="Sair do Console"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
