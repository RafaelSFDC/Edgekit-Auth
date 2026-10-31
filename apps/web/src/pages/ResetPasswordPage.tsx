import React, { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { authClient } from '../lib/auth-client';
import { EdgekitLogo } from '../components/common/EdgekitLogo';
import { useI18n } from '../i18n/context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Lock, KeyRound, CheckCircle2, ArrowRight, Loader2, ShieldAlert } from 'lucide-react';

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    const errorParam = params.get('error');

    if (errorParam) {
      setErrorMsg(t.resetPassword.invalidToken);
    } else if (tokenParam) {
      setToken(tokenParam);
    } else {
      setErrorMsg(t.resetPassword.invalidToken);
    }
  }, [t.resetPassword.invalidToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!token) {
      setErrorMsg(t.resetPassword.invalidToken);
      return;
    }

    if (password.length < 8) {
      setErrorMsg(t.resetPassword.passwordTooShort);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg(t.resetPassword.passwordMismatch);
      return;
    }

    setIsLoading(true);

    try {
      const res = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (res?.error) {
        setErrorMsg(res.error.message || t.resetPassword.invalidToken);
      } else {
        setIsSuccess(true);
        toast.success(t.resetPassword.successTitle);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro inesperado ao redefinir senha.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background glow decoration */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-in fade-in-50 duration-300">
        <div className="text-center mb-6">
          <div className="size-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 mx-auto flex items-center justify-center shadow-md shadow-indigo-500/10 mb-3.5">
            <EdgekitLogo size={28} module="auth" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.resetPassword.title}</h1>
          <p className="text-xs text-muted-foreground mt-1">{t.resetPassword.subtitle}</p>
        </div>

        <Card className="border-border/80 shadow-xl bg-card/90 backdrop-blur-xl">
          <CardHeader className="pb-4">
            {isSuccess ? (
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center space-y-3">
                <CheckCircle2 className="size-10 text-emerald-500 mx-auto" />
                <h3 className="text-sm font-bold text-foreground">{t.resetPassword.successTitle}</h3>
                <p className="text-xs text-muted-foreground">{t.resetPassword.successDesc}</p>
                <Button
                  onClick={() => navigate({ to: '/login' })}
                  className="w-full text-xs font-semibold mt-2"
                >
                  <span>{t.resetPassword.backToLogin}</span>
                  <ArrowRight className="ml-2 size-3.5" />
                </Button>
              </div>
            ) : !token ? (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-center space-y-3">
                <ShieldAlert className="size-10 text-destructive mx-auto" />
                <h3 className="text-sm font-bold text-foreground">Link Inválido</h3>
                <p className="text-xs text-muted-foreground">{t.resetPassword.invalidToken}</p>
                <Button
                  variant="outline"
                  onClick={() => navigate({ to: '/login' })}
                  className="w-full text-xs font-semibold mt-2"
                >
                  {t.resetPassword.backToLogin}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {errorMsg && (
                  <Alert variant="destructive" className="text-xs">
                    <AlertDescription>{errorMsg}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs text-muted-foreground font-medium">
                    {t.resetPassword.newPasswordLabel}
                  </Label>
                  <div className="relative">
                    <Lock className="size-4 text-muted-foreground absolute left-3 top-2.5" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="pl-9 text-xs"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-xs text-muted-foreground font-medium">
                    {t.resetPassword.confirmPasswordLabel}
                  </Label>
                  <div className="relative">
                    <Lock className="size-4 text-muted-foreground absolute left-3 top-2.5" />
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="pl-9 text-xs"
                    />
                  </div>
                </div>

                <Button type="submit" disabled={isLoading} className="w-full text-xs font-semibold mt-2">
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 size-3.5 animate-spin" />
                      {t.common.loading}
                    </>
                  ) : (
                    <>
                      <KeyRound className="mr-2 size-3.5" />
                      <span>{t.resetPassword.submitButton}</span>
                    </>
                  )}
                </Button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => navigate({ to: '/login' })}
                    className="text-[11px] text-muted-foreground hover:text-foreground hover:underline outline-hidden"
                  >
                    {t.resetPassword.backToLogin}
                  </button>
                </div>
              </form>
            )}
          </CardHeader>
        </Card>
      </div>
    </div>
  );
};
