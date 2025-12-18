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

// SVG paths for each letter A, L, B, O
const letterPaths = [
  // A (first letter)
  "M0 127.424C0 106.823 15.4222 93.9689 43.0144 93.9689C58.8725 93.9689 73.215 97.7363 85.1638 105.046C86.25 100.834 86.9005 96.1842 86.9005 91.7536C86.9005 70.4824 74.9517 58.2981 51.4898 58.2981C31.7161 58.2981 22.3756 68.2671 24.7692 84.2188L6.30289 86.4341C2.17251 58.2981 20.4242 40.5754 52.7972 40.5754C87.1216 40.5754 107.546 58.517 107.546 91.0903C107.546 100.615 105.159 110.139 101.028 118.782C109.068 128.088 115.15 139.828 119.059 154.453L102.329 160.435C99.7209 150.466 95.8117 141.824 90.8162 134.515C77.9958 150.022 58.879 160.435 38.4548 160.435C13.0351 160.435 0 147.588 0 127.424ZM39.7591 142.713C55.8368 142.712 69.521 133.851 77.9958 121.223C68.2195 114.358 56.4853 110.591 42.5851 110.591C27.8134 110.591 20.4242 117.018 20.4242 127.205C20.4242 136.51 27.591 142.712 39.7591 142.713ZM39.7591 142.713C39.7579 142.713 39.7568 142.713 39.7557 142.713H39.7622C39.7611 142.713 39.7601 142.713 39.7591 142.713Z",
  // L (second letter)
  "M155.209 0L135.006 4.41456V160H155.209V0Z",
  // B (third letter)
  "M196.946 125.118H197.382L197.375 125.124C204.114 146.755 223.231 159.998 247.564 159.998C281.024 159.998 304.271 135.943 304.271 100.402C304.271 64.8605 280.373 40.1377 245.828 40.1377C228.226 40.1377 211.503 46.5348 199.333 57.7959V0L179.13 4.41456V160H199.333L196.946 125.118ZM241.268 58.8995C267.774 58.8995 283.417 74.1324 283.417 100.177C283.417 126.003 267.995 141.454 241.489 141.454C214.983 141.454 199.34 126.222 199.34 100.177C199.34 74.1324 214.762 58.8995 241.268 58.8995Z",
  // O (fourth letter)
  "M376.34 40.1394C339.401 40.1394 312.245 65.0803 312.245 100.179C312.245 135.277 339.837 160 376.34 160C412.844 160 440 135.277 440 100.179C440 65.0803 413.279 40.1394 376.34 40.1394ZM376.34 58.9013C402.632 58.9013 419.14 75.8986 419.14 99.9606C419.14 124.241 403.067 141.456 376.34 141.456C349.613 141.456 333.105 124.023 333.105 99.9606C333.105 75.8986 350.049 58.9013 376.34 58.9013Z",
];

const AnalysisLoader = () => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [activeLetter, setActiveLetter] = useState(0);

  // Animation des lettres du logo
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveLetter((prev) => (prev + 1) % 4);
    }, 400);
    return () => clearInterval(interval);
  }, []);

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
      
      {/* Logo ALBO SVG animé lettre par lettre */}
      <div className="flex justify-center">
        <svg 
          width="180" 
          height="66" 
          viewBox="0 0 440 161" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="overflow-visible"
        >
          {letterPaths.map((path, index) => (
            <path
              key={index}
              fillRule="evenodd"
              clipRule="evenodd"
              d={path}
              className="transition-all duration-300 ease-in-out"
              style={{
                fill: activeLetter === index 
                  ? 'hsl(var(--primary))' 
                  : 'hsl(var(--muted-foreground) / 0.3)',
                filter: activeLetter === index 
                  ? 'drop-shadow(0 0 8px hsl(var(--primary) / 0.6))' 
                  : 'none',
              }}
            />
          ))}
        </svg>
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
