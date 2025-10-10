import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileType, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

const dealSubmissionSchema = z.object({
  additionalContext: z.string().max(5000, 'Additional context must be less than 5000 characters').optional()
});

export default function SubmitDeal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const [additionalContext, setAdditionalContext] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error(t('submit.errors.pdfOnly'));
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        toast.error(t('submit.errors.fileSize'));
        return;
      }
      setDeckFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!deckFile) {
      toast.error(t('submit.form.deckUpload.label') + ' required');
      return;
    }

    // Validate inputs
    const validation = dealSubmissionSchema.safeParse({
      additionalContext
    });

    if (!validation.success) {
      toast.error(validation.error.issues[0].message);
      return;
    }

    setLoading(true);
    setUploading(true);

    try {
      // Sanitize filename: remove special characters, spaces, and keep only alphanumeric, dots, hyphens, and underscores
      const sanitizedFileName = deckFile.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace invalid characters with underscore
        .replace(/_{2,}/g, '_'); // Replace multiple underscores with single one
      
      const fileName = `${user?.id}/${Date.now()}_${sanitizedFileName}`;
      setUploadProgress(10);

      const { error: uploadError } = await supabase.storage
        .from('deck-files')
        .upload(fileName, deckFile);

      if (uploadError) throw uploadError;
      setUploadProgress(50);

      const personalNotes = additionalContext || 'No additional context';

      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .insert({
          user_id: user?.id,
          startup_name: deckFile.name.replace('.pdf', ''),
          sector: 'To be determined',
          stage: 'To be determined',
          country: 'To be determined',
          personal_notes: personalNotes,
          status: 'pending',
        })
        .select()
        .single();

      if (dealError) throw dealError;
      setUploadProgress(70);

      await supabase.from('deck_files').insert({
        deal_id: deal.id,
        file_name: deckFile.name,
        storage_path: fileName,
        file_size_bytes: deckFile.size,
        mime_type: deckFile.type,
      });

      setUploadProgress(90);

      await supabase.functions.invoke('analyze-deck', {
        body: { dealId: deal.id },
      });

      setUploadProgress(100);
      toast.success(t('submit.success.title'));
      
      setTimeout(() => {
        navigate('/dashboard');
      }, 1000);

    } catch (error: any) {
      console.error('Error:', error);
      const userMessage = error.code === 'PGRST116' 
        ? 'Deal not found'
        : error.message?.includes('policy')
        ? 'Access denied'
        : t('submit.errors.failed');
      toast.error(userMessage);
    } finally {
      setLoading(false);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">{t('submit.title')}</h1>
        <p className="text-muted-foreground">{t('submit.description')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('submit.form.deckUpload.label')}</CardTitle>
            <CardDescription>{t('submit.form.deckUpload.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors">
              <input
                type="file"
                id="deck-upload"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="deck-upload" className="cursor-pointer">
                {deckFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileType className="h-12 w-12 text-primary" />
                    <p className="font-medium">{deckFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(deckFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-12 w-12 text-muted-foreground" />
                    <p className="font-medium">{t('submit.form.deckUpload.dragDrop')}</p>
                    <p className="text-sm text-muted-foreground">PDF, max 50MB</p>
                  </div>
                )}
              </label>
            </div>

            {uploading && (
              <div className="mt-4">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-center mt-2 text-muted-foreground">
                  {uploadProgress}%
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('submit.form.additionalInfo.label')}</CardTitle>
            <CardDescription>{t('submit.form.additionalInfo.contextDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="context">{t('submit.form.additionalInfo.context')}</Label>
              <Textarea
                id="context"
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder={t('submit.form.additionalInfo.contextPlaceholder')}
                rows={5}
                className="mt-2"
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={loading || !deckFile} className="w-full" size="lg">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t('submit.form.submitting')}
            </>
          ) : (
            t('submit.form.submit')
          )}
        </Button>
      </form>
    </div>
  );
}
