import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileType, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import AnalysisLoader from '@/components/AnalysisLoader';

const dealSubmissionSchema = z.object({
  additionalContext: z.string().max(5000, 'Additional context must be less than 5000 characters').optional()
});

const N8N_WEBHOOK_URL = 'https://n8n.alboteam.com/webhook/2551cfc4-1892-4926-9f17-746c9a51be71';

export default function SubmitDeal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const [additionalContext, setAdditionalContext] = useState('');
  const [createdDealId, setCreatedDealId] = useState<string | null>(null);

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

  const sendToN8N = async (dealId: string, file: File, additionalContext: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('deal_id', dealId);
    formData.append('additional_context', additionalContext || '');

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`N8N analysis failed: ${response.status} - ${errorText}`);
    }

    return response.json();
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

    setIsAnalyzing(true);
    setHasError(false);

    let dealId: string | null = null;

    try {
      // Sanitize filename
      const sanitizedFileName = deckFile.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/_{2,}/g, '_');
      
      const fileName = `${user?.id}/${Date.now()}_${sanitizedFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('deck-files')
        .upload(fileName, deckFile);

      if (uploadError) throw uploadError;

      const personalNotes = additionalContext || 'No additional context';
      const now = new Date().toISOString();

      // Create deal with pending status
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
          sent_at: now,
        })
        .select()
        .single();

      if (dealError) throw dealError;
      dealId = deal.id;
      setCreatedDealId(deal.id);

      await supabase.from('deck_files').insert({
        deal_id: deal.id,
        file_name: deckFile.name,
        storage_path: fileName,
        file_size_bytes: deckFile.size,
        mime_type: deckFile.type,
      });

      // Send to N8N webhook and wait for response
      const n8nResponse = await sendToN8N(deal.id, deckFile, additionalContext);

      // Update deal with N8N response - simplified mapping
      const { error: updateError } = await supabase
        .from('deals')
        .update({
          company_name: n8nResponse.company_name || deal.startup_name,
          memo_html: n8nResponse.memo_html || null,
          status: n8nResponse.status || 'completed',
        })
        .eq('id', deal.id);

      if (updateError) throw updateError;

      toast.success(t('submit.success.title'));
      
      // Redirect to deal detail page
      navigate(`/deal/${deal.id}`);

    } catch (error: any) {
      console.error('Error:', error);
      setHasError(true);
      
      // If deal was created, update it with error status
      if (dealId) {
        await supabase
          .from('deals')
          .update({
            status: 'error',
            error_message: error.message || 'Unknown error',
          })
          .eq('id', dealId);
      }
    }
  };

  const handleRetry = () => {
    setHasError(false);
    setIsAnalyzing(false);
    // Note: deckFile and additionalContext are preserved
  };

  const handleCancelAnalysis = async () => {
    // Update the deal status to cancelled if we have a deal ID
    if (createdDealId) {
      await supabase
        .from('deals')
        .update({ status: 'cancelled' })
        .eq('id', createdDealId);
    }
    
    // Return to upload screen, preserving the file and context
    setIsAnalyzing(false);
    setHasError(false);
    // Note: deckFile and additionalContext are NOT reset
  };

  const handleViewDeal = () => {
    if (createdDealId) {
      navigate(`/deal/${createdDealId}`);
    }
  };

  // Show analysis loader while analyzing
  if (isAnalyzing && !hasError) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <AnalysisLoader />
        <div className="flex justify-center mt-6">
          <Button 
            variant="outline" 
            onClick={handleCancelAnalysis}
            className="text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
          >
            Annuler l'analyse
          </Button>
        </div>
      </div>
    );
  }

  // Show error state
  if (hasError) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex flex-col items-center justify-center p-10 space-y-6 bg-card rounded-xl shadow-sm border border-border">
          <AlertCircle className="h-16 w-16 text-destructive" />
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Erreur dans l'analyse</h2>
            <p className="text-muted-foreground">
              Une erreur s'est produite lors de l'analyse du deck. Veuillez réessayer.
            </p>
          </div>
          <div className="flex gap-4">
            <Button variant="outline" onClick={handleRetry}>
              Réessayer
            </Button>
            {createdDealId && (
              <Button onClick={handleViewDeal}>
                Voir le deal
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

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

        <Button type="submit" disabled={!deckFile} className="w-full" size="lg">
          {t('submit.form.submit')}
        </Button>
      </form>
    </div>
  );
}