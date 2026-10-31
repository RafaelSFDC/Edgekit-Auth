import React, { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { authClient } from '../lib/auth-client';
import { EdgekitLogo } from '../components/common/EdgekitLogo';
import { useI18n } from '../i18n/context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Building2, CheckCircle2, XCircle, ArrowRight, Loader2, ShieldAlert, Mail, Users } from 'lucide-react';

export const AcceptInvitationPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [outcome, setOutcome] = useState<'accepted' | 'rejected' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: sessionData, isPending: isLoadingSession } = authClient.useSession();
  const currentUser = sessionData?.user;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || params.get('invitationId');
    if (id) {
      setInvitationId(id);
    } else {
      setErrorMsg(t.acceptInvitation.errorLoading);
    }
  }, [t.acceptInvitation.errorLoading]);

  // Query invitation details from Better Auth
  const { data: invitation, isLoading: isLoadingInvitation, error: queryError } = useQuery({
    queryKey: ['invitation', invitationId],
    queryFn: async () => {
      if (!invitationId) return null;
      const res = await (authClient.organization as any).getInvitation({
        query: { id: invitationId },
      });
      if (res?.error) {
        throw new Error(res.error.message || t.acceptInvitation.errorLoading);
      }
      return res.data;
    },
    enabled: Boolean(invitationId),
    retry: false,
  });

  const handleAccept = async () => {
    if (!invitationId) return;
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const res = await (authClient.organization as any).acceptInvitation({
        invitationId,
      });

      if (res?.error) {
        setErrorMsg(res.error.message || t.acceptInvitation.errorLoading);
      } else {
        setOutcome('accepted');
        toast.success(t.acceptInvitation.acceptedSuccess);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro inesperado ao aceitar o convite.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!invitationId) return;
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const res = await (authClient.organization as any).rejectInvitation({
        invitationId,
      });

      if (res?.error) {
        setErrorMsg(res.error.message || t.acceptInvitation.errorLoading);
      } else {
        setOutcome('rejected');
        toast.info(t.acceptInvitation.rejectedSuccess);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro inesperado ao recusar o convite.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignIn = () => {
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    navigate({ to: '/login' });
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.acceptInvitation.title}</h1>
          <p className="text-xs text-muted-foreground mt-1">{t.acceptInvitation.subtitle}</p>
        </div>

        <Card className="border-border/80 shadow-xl bg-card/90 backdrop-blur-xl">
          <CardHeader className="pb-4">
            {outcome === 'accepted' ? (
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center space-y-3">
                <CheckCircle2 className="size-10 text-emerald-500 mx-auto" />
                <h3 className="text-sm font-bold text-foreground">{t.acceptInvitation.acceptedSuccess}</h3>
                <p className="text-xs text-muted-foreground">
                  Você agora é membro da organização e pode colaborar na plataforma.
                </p>
                <Button
                  onClick={() => navigate({ to: '/' })}
                  className="w-full text-xs font-semibold mt-2"
                >
                  <span>{t.acceptInvitation.backToConsole}</span>
                  <ArrowRight className="ml-2 size-3.5" />
                </Button>
              </div>
            ) : outcome === 'rejected' ? (
              <div className="p-4 rounded-lg bg-muted/40 border border-border/60 text-center space-y-3">
                <XCircle className="size-10 text-muted-foreground mx-auto" />
                <h3 className="text-sm font-bold text-foreground">{t.acceptInvitation.rejectedSuccess}</h3>
                <Button
                  variant="outline"
                  onClick={() => navigate({ to: '/login' })}
                  className="w-full text-xs font-semibold mt-2"
                >
                  {t.resetPassword.backToLogin}
                </Button>
              </div>
            ) : !invitationId || queryError ? (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-center space-y-3">
                <ShieldAlert className="size-10 text-destructive mx-auto" />
                <h3 className="text-sm font-bold text-foreground">Convite Inválido</h3>
                <p className="text-xs text-muted-foreground">
                  {(queryError as any)?.message || t.acceptInvitation.errorLoading}
                </p>
                <Button
                  variant="outline"
                  onClick={() => navigate({ to: '/login' })}
                  className="w-full text-xs font-semibold mt-2"
                >
                  {t.resetPassword.backToLogin}
                </Button>
              </div>
            ) : isLoadingInvitation || isLoadingSession ? (
              <div className="py-8 text-center space-y-3">
                <Loader2 className="size-8 text-indigo-500 animate-spin mx-auto" />
                <p className="text-xs text-muted-foreground">Carregando detalhes do convite...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {errorMsg && (
                  <Alert variant="destructive" className="text-xs">
                    <AlertDescription>{errorMsg}</AlertDescription>
                  </Alert>
                )}

                <div className="p-4 rounded-lg bg-muted/40 border border-border/60 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center shrink-0">
                      <Building2 className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-foreground truncate">
                        {invitation?.organizationName || 'Organização'}
                      </h4>
                      <p className="text-[11px] text-muted-foreground truncate">
                        Convidado: {invitation?.email || 'Membro'}
                      </p>
                    </div>
                    {invitation?.role && (
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {invitation.role}
                      </Badge>
                    )}
                  </div>
                </div>

                {!currentUser ? (
                  <div className="space-y-3 text-center pt-2">
                    <p className="text-xs text-muted-foreground">
                      {t.acceptInvitation.loginRequired}
                    </p>
                    <Button
                      onClick={handleSignIn}
                      className="w-full text-xs font-semibold"
                    >
                      <span>Entrar para Responder</span>
                      <ArrowRight className="ml-2 size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 pt-2">
                    <Button
                      onClick={handleAccept}
                      disabled={isProcessing}
                      className="w-full text-xs font-semibold"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="mr-2 size-3.5 animate-spin" />
                          {t.acceptInvitation.accepting}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 size-3.5" />
                          <span>{t.acceptInvitation.acceptButton}</span>
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={handleReject}
                      disabled={isProcessing}
                      className="w-full text-xs"
                    >
                      {t.acceptInvitation.rejectButton}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardHeader>
        </Card>
      </div>
    </div>
  );
};
