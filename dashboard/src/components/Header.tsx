import React from "react";
import { Badge } from "./UI";
import { ShieldCheck, Sparkles } from "lucide-react";
import { authClient } from "@/lib/auth-client";

interface HeaderProps {
  title: string;
  description?: string;
}

export function Header({ title, description }: HeaderProps) {
  const { data: session } = authClient.useSession();

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/40 backdrop-blur-md px-8 py-4.5 flex items-center justify-between sticky top-0 z-30">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          {title}
        </h1>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* API Status Ping */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Worker Edge Online</span>
        </div>

        {/* Impersonation Indicator if active */}
        {session?.session?.impersonatedBy && (
          <Badge variant="warning" className="flex items-center gap-1.5 px-2.5 py-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Modo Impersonate Ativo</span>
          </Badge>
        )}

        <Badge variant="secondary" className="font-mono text-[11px] px-2.5 py-1">
          D1 SQLite
        </Badge>
      </div>
    </header>
  );
}
