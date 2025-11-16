import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, TrendingUp, Target, Users, DollarSign, Sparkles } from "lucide-react";
import { ParsedMemo, parseMemoMarkdown } from "@/utils/memoParser";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, useInView, useAnimation, AnimatePresence } from "framer-motion";
import { useRef, useEffect } from "react";

interface InvestmentMemoDisplayProps {
  memoMarkdown: string;
  dealData?: {
    companyName?: string;
    sector?: string;
    arr?: number;
    yoyGrowth?: number;
  };
  isStreaming?: boolean;
}

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 80,
      damping: 12,
      mass: 0.8,
    },
  },
};

const metricVariants = {
  hidden: { opacity: 0, scale: 0.8, rotateX: -10 },
  visible: {
    opacity: 1,
    scale: 1,
    rotateX: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 10,
    },
  },
};

const badgeVariants = {
  hidden: { opacity: 0, scale: 0 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 15,
    },
  },
};

const streamingTextVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.2,
    },
  },
};

// ============================================================================
// ANIMATED WRAPPER COMPONENT
// ============================================================================

interface AnimatedCardProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

const AnimatedCard = ({ children, delay = 0, className }: AnimatedCardProps) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={cardVariants}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function InvestmentMemoDisplay({
  memoMarkdown,
  dealData,
  isStreaming
}: InvestmentMemoDisplayProps) {
  const parsed: ParsedMemo = parseMemoMarkdown(memoMarkdown);

  const getDecisionColor = (decision?: string) => {
    if (!decision) return "default";
    if (decision === 'GO') return "default";
    if (decision === 'CONDITIONAL') return "secondary";
    if (decision === 'NO-GO') return "destructive";
    return "default";
  };

  const getDecisionLabel = (decision?: string) => {
    if (!decision) return "En analyse";
    if (decision === 'GO') return "GO";
    if (decision === 'CONDITIONAL') return "GO Conditionnel";
    if (decision === 'NO-GO') return "NO-GO";
    return decision;
  };

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header with Animations */}
      <motion.div className="space-y-4" variants={itemVariants}>
        {parsed.title && (
          <motion.h1
            className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              type: "spring",
              stiffness: 100,
              damping: 15,
              delay: 0.1,
            }}
          >
            {parsed.title}
          </motion.h1>
        )}

        <motion.div
          className="flex flex-wrap gap-2 items-center"
          variants={containerVariants}
        >
          {parsed.dealSource && (
            <motion.div variants={badgeVariants}>
              <Badge variant="outline" className="hover:scale-105 transition-transform">
                {parsed.dealSource}
              </Badge>
            </motion.div>
          )}

          {parsed.executiveSummary?.decision && (
            <motion.div variants={badgeVariants}>
              <Badge
                variant={getDecisionColor(parsed.executiveSummary.decision)}
                className="hover:scale-105 transition-transform shadow-sm"
              >
                {getDecisionLabel(parsed.executiveSummary.decision)}
              </Badge>
            </motion.div>
          )}

          {isStreaming && (
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
            >
              <Badge className="bg-primary/10 text-primary border-primary/20 hover:scale-105 transition-transform">
                <motion.div
                  className="flex items-center gap-1.5"
                  animate={{
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <Sparkles className="h-3 w-3" />
                  <span className="text-xs font-medium">Génération en cours</span>
                </motion.div>
              </Badge>
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      {/* Key Metrics with Stagger Animation */}
      {parsed.metrics && parsed.metrics.length > 0 && (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          variants={containerVariants}
        >
          {parsed.metrics.slice(0, 4).map((metric, idx) => (
            <motion.div
              key={idx}
              variants={metricVariants}
              whileHover={{
                scale: 1.05,
                y: -5,
                transition: { type: "spring", stiffness: 300, damping: 20 },
              }}
              className="group"
            >
              <Card className="h-full border-2 hover:border-primary/50 hover:shadow-lg transition-all duration-300 overflow-hidden relative">
                {/* Gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <CardHeader className="pb-2 relative z-10">
                  <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                    {metric.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative z-10">
                  <motion.div
                    className="text-2xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      delay: idx * 0.1 + 0.3,
                    }}
                  >
                    {metric.value}
                  </motion.div>
                  {metric.benchmark && (
                    <motion.p
                      className="text-xs text-muted-foreground mt-1"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.1 + 0.5 }}
                    >
                      Benchmark: {metric.benchmark}
                    </motion.p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Executive Summary with Animation */}
      {parsed.executiveSummary && (
        <AnimatedCard delay={0.2}>
          <Card
            className={`transition-all duration-300 hover:shadow-xl ${
              parsed.executiveSummary.decision === 'GO'
                ? 'border-primary/50 hover:border-primary'
                : parsed.executiveSummary.decision === 'NO-GO'
                ? 'border-destructive/50 hover:border-destructive'
                : parsed.executiveSummary.decision === 'CONDITIONAL'
                ? 'border-secondary/50 hover:border-secondary'
                : ''
            }`}
          >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Synthèse exécutive
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {parsed.executiveSummary.what && (
              <div>
                <h4 className="font-semibold mb-2">Quoi</h4>
                <p className="text-sm leading-relaxed">{parsed.executiveSummary.what}</p>
              </div>
            )}
            
            {parsed.executiveSummary.whyItWins && (
              <div>
                <h4 className="font-semibold mb-2">Pourquoi ça gagne</h4>
                <p className="text-sm leading-relaxed">{parsed.executiveSummary.whyItWins}</p>
              </div>
            )}

            {parsed.executiveSummary.proofPoints && parsed.executiveSummary.proofPoints.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Preuves</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {parsed.executiveSummary.proofPoints.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.executiveSummary.risks && parsed.executiveSummary.risks.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Risques majeurs
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {parsed.executiveSummary.risks.map((risk, idx) => (
                    <li key={idx} className="text-destructive">{risk}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.executiveSummary.decisionText && (
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Décision</h4>
                <Badge variant={getDecisionColor(parsed.executiveSummary.decision)} className="text-sm">
                  {parsed.executiveSummary.decisionText}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
        </AnimatedCard>
      )}

      {/* Terms with Animation */}
      {parsed.terms && (
        <AnimatedCard delay={0.3}>
        <Card className="hover:shadow-xl transition-all duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Terms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {parsed.terms.ticket && (
              <div className="flex justify-between items-start">
                <span className="font-medium text-sm">Ticket</span>
                <span className="text-sm text-right">{parsed.terms.ticket}</span>
              </div>
            )}
            
            {parsed.terms.preMoneyValuation && (
              <div className="flex justify-between items-start">
                <span className="font-medium text-sm">Pré-money</span>
                <span className="text-sm text-right">{parsed.terms.preMoneyValuation}</span>
              </div>
            )}

            {parsed.terms.useOfFunds && (
              <div>
                <span className="font-medium text-sm block mb-1">Usage des fonds</span>
                <p className="text-sm text-muted-foreground">{parsed.terms.useOfFunds}</p>
              </div>
            )}

            {parsed.terms.milestones && parsed.terms.milestones.length > 0 && (
              <div>
                <span className="font-medium text-sm block mb-1">Jalons clés</span>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  {parsed.terms.milestones.map((milestone, idx) => (
                    <li key={idx}>{milestone}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.terms.exitScenarios && parsed.terms.exitScenarios.length > 0 && (
              <div>
                <span className="font-medium text-sm block mb-1">Scénarios de sortie</span>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  {parsed.terms.exitScenarios.map((scenario, idx) => (
                    <li key={idx}>{scenario}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        </AnimatedCard>
      )}

      {/* Other Sections with Stagger Animation */}
      {parsed.sections && parsed.sections.map((section, idx) => (
        <AnimatedCard key={idx} delay={0.4 + idx * 0.1}>
        <Card className="hover:shadow-xl transition-all duration-300">
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                h3: ({node, ...props}) => <h3 className="text-xl font-semibold mt-4 mb-2" {...props} />,
                h4: ({node, ...props}) => <h4 className="text-lg font-semibold mt-3 mb-2" {...props} />,
                p: ({node, ...props}) => <p className="leading-7 mb-4" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-1 mb-4" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal list-inside space-y-1 mb-4" {...props} />,
                li: ({node, ...props}) => <li className="leading-7" {...props} />,
                table: ({node, ...props}) => (
                  <div className="my-4 w-full overflow-x-auto">
                    <table className="w-full border-collapse" {...props} />
                  </div>
                ),
                thead: ({node, ...props}) => <thead className="bg-muted" {...props} />,
                tr: ({node, ...props}) => <tr className="border-b" {...props} />,
                th: ({node, ...props}) => <th className="border px-4 py-2 text-left font-semibold" {...props} />,
                td: ({node, ...props}) => <td className="border px-4 py-2" {...props} />,
                strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary pl-4 italic my-4" {...props} />,
              }}
            >
              {section.content}
            </ReactMarkdown>
          </CardContent>
        </Card>
        </AnimatedCard>
      ))}

      {/* Final Recommendation with Emphasis Animation */}
      {parsed.recommendation && parsed.recommendation.decision && (
        <AnimatedCard delay={0.5}>
        <motion.div
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
        <Card className={`transition-all duration-300 hover:shadow-2xl ${
          parsed.recommendation.decision === 'GO' ? 'border-primary bg-primary/5 hover:bg-primary/10' :
          parsed.recommendation.decision === 'NO-GO' ? 'border-destructive bg-destructive/5 hover:bg-destructive/10' :
          'border-secondary bg-secondary/5 hover:bg-secondary/10'
        }`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Recommandation finale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge 
                variant={getDecisionColor(parsed.recommendation.decision)}
                className="text-base px-4 py-1"
              >
                {getDecisionLabel(parsed.recommendation.decision)}
              </Badge>
              {parsed.recommendation.ticket && (
                <span className="text-sm text-muted-foreground">
                  Ticket recommandé: {parsed.recommendation.ticket}
                </span>
              )}
            </div>

            {parsed.recommendation.rationale && (
              <p className="text-sm leading-relaxed">{parsed.recommendation.rationale}</p>
            )}

            {parsed.recommendation.conditions && parsed.recommendation.conditions.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">Conditions DD</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {parsed.recommendation.conditions.map((condition, idx) => (
                    <li key={idx}>{condition}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        </motion.div>
        </AnimatedCard>
      )}
    </motion.div>
  );
}
