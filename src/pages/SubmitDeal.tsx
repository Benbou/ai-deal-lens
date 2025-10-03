import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const SECTORS = ['FinTech', 'HealthTech', 'Climate', 'B2B SaaS', 'Marketplace', 'DeepTech', 'EdTech', 'PropTech'];
const STAGES = ['Pre-Seed', 'Seed', 'Series A', 'Series B+'];
const COUNTRIES = [
  { code: 'FR', name: 'France' },
  { code: 'UK', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
];

export default function SubmitDeal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdDealId, setCreatedDealId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    startup_name: '',
    website: '',
    amount_raised: '',
    pre_money_valuation: '',
    sector: '',
    stage: '',
    country: '',
    personal_notes: '',
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error('Please upload a PDF file');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        toast.error('File size must be less than 50MB');
        return;
      }
      setSelectedFile(file);
      toast.success('File selected: ' + file.name);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Please upload a deck file');
      return;
    }
    if (!formData.startup_name || !formData.sector || !formData.stage || !formData.country) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      // Create deal record
      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .insert({
          user_id: user!.id,
          startup_name: formData.startup_name,
          website: formData.website || null,
          amount_raised_cents: formData.amount_raised ? parseFloat(formData.amount_raised) * 100 * 1000 : null,
          pre_money_valuation_cents: formData.pre_money_valuation ? parseFloat(formData.pre_money_valuation) * 100 * 1000 : null,
          sector: formData.sector,
          stage: formData.stage,
          country: formData.country,
          personal_notes: formData.personal_notes || null,
          status: 'pending',
        })
        .select()
        .single();

      if (dealError) throw dealError;

      // Upload file to storage
      const filePath = `${user!.id}/${deal.id}/${selectedFile.name}`;
      setUploadProgress(50);
      
      const { error: uploadError } = await supabase.storage
        .from('deck-files')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;
      setUploadProgress(75);

      // Create deck file record
      const { error: fileError } = await supabase
        .from('deck_files')
        .insert({
          deal_id: deal.id,
          file_name: selectedFile.name,
          storage_path: filePath,
          file_size_bytes: selectedFile.size,
          mime_type: selectedFile.type,
        });

      if (fileError) throw fileError;
      setUploadProgress(100);

      // Trigger analysis (will be implemented in edge function)
      await supabase.functions.invoke('analyze-deck', {
        body: { dealId: deal.id }
      });

      setCreatedDealId(deal.id);
      setShowSuccess(true);
      toast.success('Deal submitted successfully!');
    } catch (error: any) {
      console.error('Error submitting deal:', error);
      toast.error(error.message || 'Failed to submit deal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-4xl font-bold">Submit Deal</h1>
          <p className="text-muted-foreground mt-2">
            Upload a deck and get AI-powered analysis in ~10 minutes
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Deal Information</CardTitle>
              <CardDescription>Provide details about the investment opportunity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="startup_name">Startup Name *</Label>
                <Input
                  id="startup_name"
                  value={formData.startup_name}
                  onChange={(e) => setFormData({ ...formData, startup_name: e.target.value })}
                  placeholder="Acme Inc."
                  required
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="deck-upload">Deck Upload *</Label>
                <div className="mt-2 border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                  <input
                    id="deck-upload"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label htmlFor="deck-upload" className="cursor-pointer">
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileText className="h-8 w-8 text-success" />
                        <div className="text-left">
                          <p className="font-medium">{selectedFile.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-medium">Drop your PDF here or click to browse</p>
                        <p className="text-sm text-muted-foreground mt-2">Maximum file size: 50MB</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amount_raised">Amount Raised (€M)</Label>
                  <Input
                    id="amount_raised"
                    type="number"
                    step="0.1"
                    value={formData.amount_raised}
                    onChange={(e) => setFormData({ ...formData, amount_raised: e.target.value })}
                    placeholder="2.5"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="pre_money_valuation">Pre-money Valuation (€M)</Label>
                  <Input
                    id="pre_money_valuation"
                    type="number"
                    step="0.1"
                    value={formData.pre_money_valuation}
                    onChange={(e) => setFormData({ ...formData, pre_money_valuation: e.target.value })}
                    placeholder="10"
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sector">Sector *</Label>
                  <Select value={formData.sector} onValueChange={(value) => setFormData({ ...formData, sector: value })}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select sector" />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTORS.map(sector => (
                        <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="stage">Stage *</Label>
                  <Select value={formData.stage} onValueChange={(value) => setFormData({ ...formData, stage: value })}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map(stage => (
                        <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="country">Country *</Label>
                  <Select value={formData.country} onValueChange={(value) => setFormData({ ...formData, country: value })}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(country => (
                        <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://example.com"
                    className="mt-2"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="personal_notes">Personal Notes</Label>
                <Textarea
                  id="personal_notes"
                  value={formData.personal_notes}
                  onChange={(e) => setFormData({ ...formData, personal_notes: e.target.value })}
                  placeholder="Add any context or notes about this deal..."
                  rows={4}
                  className="mt-2"
                />
              </div>

              {loading && uploadProgress > 0 && (
                <div className="space-y-2">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Uploading... {uploadProgress}%
                  </p>
                </div>
              )}

              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/dashboard')}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit & Analyze'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>

      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-success" />
              Deal Submitted Successfully!
            </DialogTitle>
            <DialogDescription className="space-y-4 pt-4">
              <p>Your deck has been uploaded and AI analysis is starting now.</p>
              <p className="text-sm text-muted-foreground">
                Estimated analysis time: <strong>~10 minutes</strong>
              </p>
              <p className="text-sm">
                You can track the progress in real-time on the deal details page.
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowSuccess(false); navigate('/dashboard'); }} className="flex-1">
              Back to Dashboard
            </Button>
            <Button onClick={() => { setShowSuccess(false); navigate(`/deals/${createdDealId}`); }} className="flex-1">
              View Progress
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
