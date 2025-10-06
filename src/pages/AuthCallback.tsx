import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase will parse the URL hash and set the session automatically
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        toast.error(error.message || 'Authentication failed');
        navigate('/auth');
        return;
      }
      if (session) {
        toast.success('Signed in successfully');
        navigate('/dashboard');
        return;
      }
      // If no session yet, try exchanging code if present (PKCE flow)
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          toast.error(exchangeError.message || 'Authentication failed');
          navigate('/auth');
          return;
        }
        toast.success('Signed in successfully');
        navigate('/dashboard');
        return;
      }
      navigate('/auth');
    };
    handleCallback();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground">Finishing sign-in…</div>
    </div>
  );
}


