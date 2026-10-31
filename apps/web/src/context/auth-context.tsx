import React, { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react';
import { authClient } from '../lib/auth-client';
import { toast } from 'sonner';

export interface AuthContextType {
  user: any;
  session: any;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isImpersonating: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refetchSession: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: sessionData, isPending, refetch } = authClient.useSession();

  const user = sessionData?.user ?? null;
  const session = sessionData?.session ?? null;
  const isAuthenticated = Boolean(user);
  const isSuperAdmin = Boolean((user as any)?.isSuperAdmin === true || (user as any)?.role === 'super_admin');
  const isAdmin = isSuperAdmin;
  const isImpersonating = Boolean(session?.impersonatedBy);

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut();
      toast.info('Sessão encerrada com sucesso.');
      window.location.href = '/login';
    } catch (err: any) {
      toast.error(err.message || 'Erro ao encerrar sessão.');
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      isAuthenticated,
      isAdmin,
      isSuperAdmin,
      isImpersonating,
      isLoading: isPending,
      signOut,
      refetchSession: refetch,
    }),
    [user, session, isAuthenticated, isAdmin, isSuperAdmin, isImpersonating, isPending, signOut, refetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
