import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { authClient } from '../lib/auth-client';
import { EdgekitLogo } from '../components/common/EdgekitLogo';
import { useI18n } from '../i18n/context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Fingerprint, Mail, KeyRound, Loader2, Lock, ArrowRight, ShieldCheck } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Forgot Password modal state
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isForgotLoading, setIsForgotLoading] = useState(false);

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
        setErrorMsg(res.error.message || t.login.errorCredentials);
        setIsLoading(false);
        return;
      }

      // Check admin status
      const session = await authClient.getSession();
      if ((session?.data?.user as any)?.role !== 'admin') {
        setErrorMsg(t.login.errorNotAdmin);
        setIsLoading(false);
        return;
      }

      toast.success('Login efetuado com sucesso!');
      navigate({ to: '/' });
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro inesperado ao conectar à API.');
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
        setErrorMsg(res.error.message || 'Falha na autenticação via Passkey.');
      } else {
        toast.success('Autenticado via Passkey!');
        navigate({ to: '/' });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Passkey cancelada ou não suportada neste dispositivo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setErrorMsg('Informe seu email para receber o Magic Link.');
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
        setErrorMsg(res.error.message || 'Falha ao enviar Magic Link.');
      } else {
        setMagicLinkSent(true);
        toast.success(t.login.magicLinkSentTitle);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao solicitar Magic Link.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setIsForgotLoading(true);
    try {
      const res = await (authClient as any).requestPasswordReset({
        email: forgotEmail,
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (res?.error) {
        toast.error(res.error.message || 'Falha ao solicitar recuperação de senha.');
      } else {
        toast.success(t.login.forgotPasswordSent);
        setIsForgotPasswordOpen(false);
        setForgotEmail('');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro inesperado.');
    } finally {
      setIsForgotLoading(false);
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.login.title}</h1>
          <p className="text-xs text-muted-foreground mt-1">{t.login.subtitle}</p>
        </div>

        <Card className="border-border/80 shadow-xl bg-card/90 backdrop-blur-xl">
          <CardHeader className="pb-4">
            <Tabs defaultValue="password" className="w-full">
              <TabsList className="grid grid-cols-3 w-full bg-muted/60 p-1">
                <TabsTrigger value="password" className="text-xs">
                  {t.login.emailTab}
                </TabsTrigger>
                <TabsTrigger value="passkey" className="text-xs">
                  {t.login.passkeyTab}
                </TabsTrigger>
                <TabsTrigger value="magic" className="text-xs">
                  {t.login.magicLinkTab}
                </TabsTrigger>
              </TabsList>

              {errorMsg && (
                <Alert variant="destructive" className="mt-4 text-xs">
                  <AlertDescription>{errorMsg}</AlertDescription>
                </Alert>
              )}

              {/* Aba 1: Email e Senha */}
              <TabsContent value="password" className="mt-4">
                <form onSubmit={handleEmailSignIn} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs text-muted-foreground font-medium">
                      {t.login.emailLabel}
                    </Label>
                    <div className="relative">
                      <Mail className="size-4 text-muted-foreground absolute left-3 top-2.5" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t.login.emailPlaceholder}
                        required
                        className="pl-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-xs text-muted-foreground font-medium">
                        {t.login.passwordLabel}
                      </Label>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotEmail(email);
                          setIsForgotPasswordOpen(true);
                        }}
                        className="text-[11px] text-indigo-500 hover:text-indigo-400 hover:underline outline-hidden font-medium"
                      >
                        {t.login.forgotPasswordLink}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="size-4 text-muted-foreground absolute left-3 top-2.5" />
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t.login.passwordPlaceholder}
                        required
                        className="pl-9 text-xs"
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={isLoading} className="w-full text-xs font-semibold mt-2">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 size-3.5 animate-spin" />
                        {t.login.authenticating}
                      </>
                    ) : (
                      <>
                        <span>{t.login.signInButton}</span>
                        <ArrowRight className="ml-2 size-3.5" />
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* Aba 2: Passkey WebAuthn */}
              <TabsContent value="passkey" className="mt-4 space-y-4">
                <div className="p-4 rounded-lg bg-muted/40 border border-border/60 text-center space-y-3">
                  <div className="size-10 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto">
                    <Fingerprint className="size-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground">WebAuthn / Passkey</h4>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t.login.passkeyDesc}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handlePasskeySignIn}
                    disabled={isLoading}
                    className="w-full text-xs font-semibold"
                  >
                    {isLoading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <>
                        <Fingerprint className="mr-2 size-3.5" />
                        <span>{t.login.passkeyButton}</span>
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>

              {/* Aba 3: Magic Link */}
              <TabsContent value="magic" className="mt-4 space-y-4">
                {magicLinkSent ? (
                  <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center space-y-2">
                    <ShieldCheck className="size-8 text-emerald-500 mx-auto" />
                    <h4 className="text-xs font-bold text-foreground">{t.login.magicLinkSentTitle}</h4>
                    <p className="text-[11px] text-muted-foreground">{t.login.magicLinkSentDesc}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMagicLinkSent(false)}
                      className="text-xs mt-2"
                    >
                      {t.common.cancel}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="magic-email" className="text-xs text-muted-foreground font-medium">
                        {t.login.emailLabel}
                      </Label>
                      <Input
                        id="magic-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t.login.emailPlaceholder}
                        className="text-xs"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t.login.magicLinkDesc}
                    </p>
                    <Button
                      type="button"
                      onClick={handleMagicLink}
                      disabled={isLoading}
                      className="w-full text-xs font-semibold"
                    >
                      {isLoading ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <>
                          <Mail className="mr-2 size-3.5" />
                          <span>{t.login.magicLinkButton}</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardHeader>
        </Card>

        <p className="text-[11px] text-muted-foreground text-center mt-6">
          {t.login.adminOnlyNotice}
        </p>
      </div>

      {/* Modal de Recuperação de Senha */}
      <Dialog open={isForgotPasswordOpen} onOpenChange={setIsForgotPasswordOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <KeyRound className="size-4 text-indigo-500" />
              <span>{t.login.forgotPasswordModalTitle}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t.login.forgotPasswordModalDesc}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleForgotPassword} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email" className="text-xs text-muted-foreground font-medium">
                {t.login.emailLabel}
              </Label>
              <Input
                id="forgot-email"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder={t.login.emailPlaceholder}
                required
                className="text-xs"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsForgotPasswordOpen(false)}
                className="text-xs"
              >
                {t.common.cancel}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isForgotLoading}
                className="text-xs font-semibold gap-1.5"
              >
                {isForgotLoading && <Loader2 className="size-3.5 animate-spin" />}
                <span>{t.login.forgotPasswordSubmit}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
