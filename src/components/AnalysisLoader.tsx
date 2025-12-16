import { useState, useEffect } from 'react';

const analysisSteps = [
  { icon: "🔍", text: "Identification de l'opportunité..." },
  { icon: "📊", text: "Analyse du marché et de la taille adressable..." },
  { icon: "🏢", text: "Recherche des concurrents directs et indirects..." },
  { icon: "👥", text: "Vérification du parcours des fondateurs..." },
  { icon: "💰", text: "Analyse des métriques financières..." },
  { icon: "📈", text: "Évaluation de la traction commerciale..." },
  { icon: "⚖️", text: "Construction de la matrice de risques..." },
  { icon: "🎯", text: "Comparaison avec les benchmarks sectoriels..." },
  { icon: "📝", text: "Rédaction des recommandations..." },
  { icon: "✨", text: "Finalisation du mémo d'investissement..." },
];

const AnalysisLoader = () => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Rotation des étapes toutes les 3.5 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStepIndex((prev) => (prev + 1) % analysisSteps.length);
        setIsTransitioning(false);
      }, 300);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  // Compteur de temps écoulé
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentStep = analysisSteps[currentStepIndex];

  return (
    <div className="flex flex-col items-center justify-center p-10 space-y-8 bg-card rounded-xl shadow-sm border border-border">
      
      {/* Logo ALBO animé lettre par lettre */}
      <div className="flex space-x-1">
        {'ALBO'.split('').map((letter, index) => (
          <span
            key={index}
            className="text-5xl font-bold text-primary animate-pulse"
            style={{
              animationDelay: `${index * 200}ms`,
              animationDuration: '1.5s',
            }}
          >
            {letter}
          </span>
        ))}
      </div>
      
      {/* Étape actuelle avec icône */}
      <div 
        className={`flex items-center justify-center space-x-3 min-h-[40px] transition-all duration-300 ease-in-out ${
          isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
        }`}
      >
        <span className="text-2xl">{currentStep.icon}</span>
        <p className="text-lg text-muted-foreground font-medium">
          {currentStep.text}
        </p>
      </div>
      
      {/* Dots animés */}
      <div className="flex space-x-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce"
            style={{
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}
      </div>
      
      {/* Temps écoulé */}
      <p className="text-sm text-muted-foreground/60">
        Temps écoulé : {formatTime(elapsedSeconds)}
      </p>
      
    </div>
  );
};

export default AnalysisLoader;
