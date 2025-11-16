import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Loader2, XCircle, FileText, Search, Sparkles, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnalysisProgressBarProps {
  analysis: {
    status: string | null;
    progress_percent: number | null;
    current_step: string | null;
    error_message: string | null;
  } | null;
}

export function AnalysisProgressBar({ analysis }: AnalysisProgressBarProps) {
  if (!analysis) {
    return null;
  }

  const progress = analysis.progress_percent || 0;
  const isCompleted = analysis.status === 'completed';
  const isFailed = analysis.status === 'failed';
  const isProcessing = !isCompleted && !isFailed;

  const steps = [
    { label: 'Extraction PDF', icon: FileText, threshold: 30 },
    { label: 'Analyse Contexte', icon: Search, threshold: 40 },
    { label: 'Génération Mémo', icon: Sparkles, threshold: 85 },
    { label: 'Finalisation', icon: Database, threshold: 100 },
  ];

  return (
    <Card className={cn(
      isCompleted && 'border-green-200 bg-green-50',
      isFailed && 'border-red-200 bg-red-50',
      isProcessing && 'border-blue-200 bg-blue-50'
    )}>
      <CardContent className="pt-6 space-y-4">
        {/* Status Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isCompleted && <CheckCircle className="w-5 h-5 text-green-600" />}
            {isFailed && <XCircle className="w-5 h-5 text-red-600" />}
            {isProcessing && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
            <span className={cn(
              'font-semibold',
              isCompleted && 'text-green-900',
              isFailed && 'text-red-900',
              isProcessing && 'text-blue-900'
            )}>
              {isCompleted ? 'Analyse Terminée' : isFailed ? 'Analyse Échouée' : 'Analyse en Cours'}
            </span>
          </div>
          <span className={cn(
            'text-sm font-medium',
            isCompleted && 'text-green-600',
            isFailed && 'text-red-600',
            isProcessing && 'text-blue-600'
          )}>
            {progress}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress 
            value={progress} 
            className={cn(
              'h-2',
              isCompleted && '[&>div]:bg-green-600',
              isFailed && '[&>div]:bg-red-600'
            )}
          />
          <p className="text-xs text-muted-foreground">
            {analysis.current_step || 'Initialisation...'}
          </p>
        </div>

        {/* Step Indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            const completed = progress >= step.threshold;
            const active = progress >= (steps[index - 1]?.threshold || 0) && progress < step.threshold;

            return (
              <div key={step.label} className="flex flex-col items-center gap-2">
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                  completed && 'bg-green-100 text-green-600',
                  active && 'bg-blue-100 text-blue-600',
                  !completed && !active && 'bg-gray-100 text-gray-400'
                )}>
                  {completed ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : active ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <StepIcon className="w-5 h-5" />
                  )}
                </div>
                <p className={cn(
                  'text-xs text-center font-medium',
                  completed && 'text-green-900',
                  active && 'text-blue-900',
                  !completed && !active && 'text-muted-foreground'
                )}>
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>

        {/* Error Message */}
        {isFailed && analysis.error_message && (
          <div className="bg-red-100 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{analysis.error_message}</p>
          </div>
        )}

        {/* Estimated Time */}
        {isProcessing && (
          <p className="text-xs text-muted-foreground text-center">
            Temps estimé restant : {Math.max(1, Math.ceil((100 - progress) / 50))} minute{Math.ceil((100 - progress) / 50) > 1 ? 's' : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
