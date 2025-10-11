import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sparkles, BarChart3, Zap } from 'lucide-react';
import { useEffect } from 'react';
import logo from '@/assets/logo.svg';
const DotPattern = () => {
  return <div className="absolute inset-0 -z-10 h-full w-full bg-background">
      <div className="absolute h-full w-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" style={{
      backgroundImage: `radial-gradient(circle at 25px 25px, hsl(var(--color-primary) / 0.15) 2px, transparent 0)`,
      backgroundSize: '50px 50px'
    }} />
    </div>;
};
export default function Landing() {
  const {
    user
  } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);
  return <div className="relative min-h-screen w-full overflow-hidden">
      <DotPattern />
      
      {/* Header */}
      <header className="relative z-50 border-b bg-background/50 backdrop-blur-sm sticky top-0">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src={logo} alt="albo" className="h-8" />
          </div>
          <Button onClick={() => navigate('/auth')} className="bg-foreground text-background hover:bg-foreground/90">
            Start Analysing
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <div className="container relative z-10 mx-auto flex min-h-[calc(100vh-80px)] flex-col items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background/50 px-4 py-2 text-sm backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">AI-Powered Deck Analysis</span>
          </div>
          
          <h1 className="mb-6 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl lg:text-7xl">Analyse your pitch deck!</h1>
          
          <p className="mb-10 text-lg text-muted-foreground sm:text-xl lg:text-2xl">Get instant, actionable insights of the market and company directly from the pitch deck</p>
          
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="group gap-2 text-base bg-foreground text-background hover:bg-foreground/90" onClick={() => navigate('/auth')}>
              Start Analyzing
              <Zap className="h-4 w-4 transition-transform group-hover:scale-110" />
            </Button>
          </div>
          
          <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background/50 p-6 backdrop-blur-sm">
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">AI-Powered</h3>
              <p className="text-sm text-muted-foreground">
                Advanced algorithms analyze every aspect of your deck
              </p>
            </div>
            
            <div className="rounded-lg border border-border bg-background/50 p-6 backdrop-blur-sm">
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Instant Results</h3>
              <p className="text-sm text-muted-foreground">
                Get comprehensive feedback in seconds, not days
              </p>
            </div>
            
            <div className="rounded-lg border border-border bg-background/50 p-6 backdrop-blur-sm">
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Actionable Insights</h3>
              <p className="text-sm text-muted-foreground">
                Clear recommendations to improve your presentation
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>;
}