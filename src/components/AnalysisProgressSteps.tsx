import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { FileText, Wand2, Brain, CheckCircle2, Loader2, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface AnalysisProgressStepsProps {
  analysis: {
    status: string | null;
    progress_percent: number | null;
    current_step: string | null;
    error_message: string | null;
  } | null;
}

type StepKey = 'ocr' | 'cleaning' | 'claude';
type StepStatus = 'pending' | 'active' | 'completed' | 'error';

interface StepConfig {
  key: StepKey;
  icon: any;
  title: string;
  description: string;
  progressRange: [number, number];
  color: string;
}

const stepConfigs: StepConfig[] = [
  {
    key: 'ocr',
    icon: FileText,
    title: 'Extraction PDF',
    description: 'Lecture et extraction du contenu',
    progressRange: [0, 33],
    color: 'indigo',
  },
  {
    key: 'cleaning',
    icon: Wand2,
    title: 'Nettoyage',
    description: 'Normalisation des données',
    progressRange: [34, 66],
    color: 'purple',
  },
  {
    key: 'claude',
    icon: Brain,
    title: 'Analyse IA',
    description: 'Claude Opus génère le mémo',
    progressRange: [67, 100],
    color: 'blue',
  },
];

function getStepStatus(progress: number, config: StepConfig): StepStatus {
  if (progress < config.progressRange[0]) return 'pending';
  if (progress >= config.progressRange[0] && progress < config.progressRange[1]) return 'active';
  return 'completed';
}

function StepCard({ config, status, progress }: { config: StepConfig; status: StepStatus; progress: number }) {
  const Icon = config.icon;
  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const isPending = status === 'pending';

  const stepProgress = isActive
    ? ((progress - config.progressRange[0]) / (config.progressRange[1] - config.progressRange[0])) * 100
    : isCompleted
    ? 100
    : 0;

  return (
    <div className={isActive ? 'scale-105 transition-transform' : 'transition-transform'}>
      <Card
        className={cn(
          'p-6 text-center transition-all',
          isActive && 'bg-card border-primary/50 shadow-lg',
          isCompleted && 'bg-success/5 border-success/30',
          isPending && 'bg-muted/30 border-border'
        )}
      >
        <div className="mb-3 inline-block">
          {isCompleted ? (
            <CheckCircle2 className="w-10 h-10 text-success" />
          ) : isActive ? (
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          ) : (
            <Icon className="w-10 h-10 text-muted-foreground" />
          )}
        </div>

        <h3
          className={cn(
            'font-semibold text-sm mb-1',
            isActive && 'text-foreground',
            isCompleted && 'text-success',
            isPending && 'text-muted-foreground'
          )}
        >
          {config.title}
        </h3>

        <p className="text-xs text-muted-foreground mb-3">{config.description}</p>

        {(isActive || isCompleted) && (
          <div className="space-y-1">
            <Progress value={stepProgress} className="h-1.5" />
            <p className="text-xs text-muted-foreground">{Math.round(stepProgress)}%</p>
          </div>
        )}
      </Card>
    </div>
  );
}

export function AnalysisProgressSteps({ analysis }: AnalysisProgressStepsProps) {
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [activityLogs, setActivityLogs] = useState<Array<{ time: string; message: string; type: string }>>([]);

  useEffect(() => {
    if (!analysis || analysis.status !== 'processing') return;

    const timer = setInterval(() => {
      setTimeElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [analysis?.status]);

  useEffect(() => {
    if (!analysis?.current_step) return;

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    setActivityLogs((prev) => [
      ...prev,
      {
        time: timeStr,
        message: analysis.current_step || '',
        type: 'info',
      },
    ]);
  }, [analysis?.current_step]);

  if (!analysis) return null;

  const progress = analysis.progress_percent || 0;
  const isCompleted = analysis.status === 'completed';
  const isFailed = analysis.status === 'failed';
  const isProcessing = analysis.status === 'processing';

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const timeRemaining = Math.max(0, 600 - timeElapsed);

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="text-center">
        <div className="mb-4 inline-block">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary to-primary-glow rounded-full flex items-center justify-center shadow-glow">
            <Brain className="w-10 h-10 text-primary-foreground" />
          </div>
        </div>

        <h2 className="text-3xl font-bold mb-2">
          {isCompleted ? 'Analyse Terminée' : isFailed ? 'Analyse Échouée' : 'Analyse en Cours'}
        </h2>
        <p className="text-muted-foreground">
          {isCompleted
            ? 'Votre mémo d\'investissement est prêt'
            : isFailed
            ? 'Une erreur est survenue'
            : 'Notre IA examine minutieusement votre deck...'}
        </p>
      </div>

      {/* Three-Step Pipeline */}
      {!isFailed && (
        <div className="relative">
          {/* Connector Line */}
          <div className="absolute top-12 left-0 right-0 h-1 bg-gradient-to-r from-primary/20 via-primary/20 to-primary/20 -z-10" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stepConfigs.map((config, idx) => (
              <div key={config.key}>
                <StepCard
                  config={config}
                  status={getStepStatus(progress, config)}
                  progress={progress}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Log */}
      {isProcessing && activityLogs.length > 0 && (
        <Card className="bg-card/50 backdrop-blur border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Activité en temps réel</h3>
            </div>

            <div className="bg-muted rounded-lg p-4 max-h-40 overflow-y-auto space-y-2 font-mono text-xs">
              {activityLogs.slice(-10).map((log, idx) => (
                <div key={idx} className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-muted-foreground/60">{log.time}</span>
                  <span className="text-primary">•</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Time & Stats Footer */}
      {isProcessing && (
        <Card className="bg-gradient-to-r from-card/50 to-card/30 backdrop-blur border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{formatTime(timeRemaining)}</p>
                  <p className="text-xs text-muted-foreground">temps restant estimé</p>
                </div>
              </div>

              <div className="flex-1 max-w-xs">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium">Progression globale</span>
                  <span className="text-xs font-bold text-primary">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              <div className="text-right">
                <Badge variant="outline" className="text-xs">
                  {progress < 33 && '📄 Extraction PDF'}
                  {progress >= 33 && progress < 66 && '🧹 Nettoyage'}
                  {progress >= 66 && '🧠 Analyse IA'}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Étape {progress < 33 ? '1' : progress < 66 ? '2' : '3'} sur 3
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Message */}
      {isFailed && analysis.error_message && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-destructive mb-1">Erreur d'analyse</h3>
                <p className="text-sm text-muted-foreground">{analysis.error_message}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success Message */}
      {isCompleted && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
          <div className="text-6xl">
            🎉
          </div>
        </div>
      )}
    </div>
  );
}
