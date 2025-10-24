import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ClaimDeal() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [dealInfo, setDealInfo] = useState<{ dealId: string; phone?: string; email?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (!token) {
      setError('Token manquant. Veuillez vérifier votre lien.');
      setLoading(false);
      return;
    }

    // Decode JWT token (simple base64 decode for now)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setDealInfo(payload);
      
      // If user is already logged in, auto-claim
      if (user) {
        claimDeal(payload.dealId);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError('Token invalide. Veuillez vérifier votre lien.');
      setLoading(false);
    }
  }, [searchParams, user]);

  const claimDeal = async (dealId: string) => {
    setClaiming(true);
    try {
      const { error: updateError } = await supabase
        .from('deals')
        .update({ 
          user_id: user?.id,
          temp_phone: null,
          temp_email: null
        })
        .eq('id', dealId);

      if (updateError) throw updateError;

      setSuccess(true);
      toast.success('Deal associé à votre compte !');
      
      // Redirect to deal page after 2 seconds
      setTimeout(() => {
        navigate(`/deal/${dealId}`);
      }, 2000);
    } catch (err: any) {
      console.error('Error claiming deal:', err);
      toast.error('Erreur lors de l\'association du deal');
      setError(err.message);
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-md">
        <Card className="border-destructive">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle>Erreur</CardTitle>
            </div>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/dashboard')} className="w-full">
              Retour au dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-md">
        <Card className="border-green-500">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <CardTitle>Deal associé !</CardTitle>
            </div>
            <CardDescription>
              Votre deal a été associé à votre compte. Redirection en cours...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Associer votre deal</CardTitle>
          <CardDescription>
            {dealInfo?.phone && `Envoyé depuis le numéro : ${dealInfo.phone}`}
            {dealInfo?.email && `Envoyé depuis l'email : ${dealInfo.email}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Vous devez être connecté pour associer ce deal à votre compte.
          </p>
          <div className="space-y-2">
            <Button 
              onClick={() => navigate('/auth?redirect=/claim-deal?' + searchParams.toString())} 
              className="w-full"
            >
              Se connecter
            </Button>
            <Button 
              onClick={() => navigate('/auth?mode=signup&redirect=/claim-deal?' + searchParams.toString())} 
              variant="outline"
              className="w-full"
            >
              Créer un compte
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
