import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function Profile() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    country: '',
    phone: '',
    investment_focus: [] as string[],
    check_size_min: 0,
    check_size_max: 0,
  });

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (error) throw error;

      if (data) {
        setProfile({
          name: data.name || '',
          email: data.email || '',
          country: data.country || '',
          phone: data.phone || '',
          investment_focus: data.investment_focus || [],
          check_size_min: data.check_size_min || 0,
          check_size_max: data.check_size_max || 0,
        });
      }
    } catch (error: any) {
      console.error('Error loading profile:', error);
      toast.error('Failed to load profile');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: profile.name,
          country: profile.country,
          phone: profile.phone || null,
          investment_focus: profile.investment_focus,
          check_size_min: profile.check_size_min,
          check_size_max: profile.check_size_max,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.id);

      if (error) throw error;

      toast.success('Profile updated successfully');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">{t('profile.title')}</h1>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('profile.personalInfo')}</CardTitle>
            <CardDescription>{t('profile.personalInfoDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">{t('profile.name')}</Label>
              <Input
                id="name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                required
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="email">{t('profile.email')}</Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                disabled
                className="mt-2 bg-muted"
              />
              <p className="text-sm text-muted-foreground mt-1">
                {t('profile.emailNotice')}
              </p>
            </div>

            <div>
              <Label htmlFor="country">{t('profile.country')}</Label>
              <Input
                id="country"
                value={profile.country}
                onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                placeholder="France"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="phone">Téléphone (WhatsApp)</Label>
              <Input
                id="phone"
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+33612345678"
                className="mt-2"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Format international requis. Permet l'upload via WhatsApp.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('profile.investmentPreferences')}</CardTitle>
            <CardDescription>{t('profile.investmentPreferencesDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="check-min">{t('profile.checkSize')} (Min)</Label>
                <Input
                  id="check-min"
                  type="number"
                  value={profile.check_size_min}
                  onChange={(e) => setProfile({ ...profile, check_size_min: parseInt(e.target.value) || 0 })}
                  placeholder="10000"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="check-max">{t('profile.checkSize')} (Max)</Label>
                <Input
                  id="check-max"
                  type="number"
                  value={profile.check_size_max}
                  onChange={(e) => setProfile({ ...profile, check_size_max: parseInt(e.target.value) || 0 })}
                  placeholder="500000"
                  className="mt-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? t('profile.saving') : t('profile.save')}
        </Button>
      </form>
    </div>
  );
}
