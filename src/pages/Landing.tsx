import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileText, TrendingUp, Shield, Zap } from 'lucide-react';
import { useEffect } from 'react';

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              BA Deck Analyzer
            </span>
          </div>
          <Button onClick={() => navigate('/auth')} variant="outline">
            Sign In
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          <h1 className="text-5xl md:text-6xl font-bold leading-tight">
            AI-Powered Investment
            <br />
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Deck Analysis
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Upload startup decks and get comprehensive AI analysis in minutes. 
            Track valuation gaps, assess risks, and make data-driven investment decisions.
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" onClick={() => navigate('/auth')} className="shadow-glow">
              Get Started <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline">
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-card border rounded-xl p-6 hover:shadow-elegant transition-all">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">10-Minute Analysis</h3>
            <p className="text-muted-foreground">
              Upload a deck and get comprehensive AI analysis with market intelligence in just 10 minutes.
            </p>
          </div>

          <div className="bg-card border rounded-xl p-6 hover:shadow-elegant transition-all">
            <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center mb-4">
              <TrendingUp className="h-6 w-6 text-success" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Valuation Benchmarks</h3>
            <p className="text-muted-foreground">
              Compare deals against sector medians and identify valuation gaps automatically.
            </p>
          </div>

          <div className="bg-card border rounded-xl p-6 hover:shadow-elegant transition-all">
            <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-warning" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Risk Assessment</h3>
            <p className="text-muted-foreground">
              Get AI-powered risk scores with detailed strengths, weaknesses, and red flags.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="bg-gradient-hero rounded-2xl p-12 text-center text-white">
          <h2 className="text-4xl font-bold mb-4">Ready to analyze your first deck?</h2>
          <p className="text-xl mb-8 opacity-90">
            Join investors making smarter decisions with AI-powered analysis
          </p>
          <Button size="lg" variant="secondary" onClick={() => navigate('/auth')}>
            Start Analyzing Now <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card/50 backdrop-blur-sm mt-20">
        <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
          <p>&copy; 2025 BA Deck Analyzer. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
