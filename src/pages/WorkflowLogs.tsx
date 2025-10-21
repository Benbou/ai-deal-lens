import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { DashboardLayout } from "@/components/DashboardLayout";

interface WorkflowLog {
  id: string;
  deal_id: string;
  step_name: string;
  status: "pending" | "running" | "success" | "error";
  input: any;
  output: any;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export default function WorkflowLogs() {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [dealName, setDealName] = useState("");

  useEffect(() => {
    if (!dealId) return;

    loadLogs();
    loadDealName();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`workflow_logs:${dealId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workflow_logs",
          filter: `deal_id=eq.${dealId}`,
        },
        () => {
          loadLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealId]);

  const loadLogs = async () => {
    if (!dealId) return;

    const { data, error } = await supabase
      .from("workflow_logs")
      .select("*")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading logs:", error);
    } else {
      setLogs((data as WorkflowLog[]) || []);
    }
    setLoading(false);
  };

  const loadDealName = async () => {
    if (!dealId) return;

    const { data } = await supabase
      .from("deals")
      .select("company_name, startup_name")
      .eq("id", dealId)
      .single();

    if (data) {
      setDealName(data.company_name || data.startup_name);
    }
  };

  const toggleLogExpansion = (logId: string) => {
    setExpandedLogs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: WorkflowLog["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "running":
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case "pending":
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadgeVariant = (status: WorkflowLog["status"]) => {
    switch (status) {
      case "success":
        return "default";
      case "running":
        return "secondary";
      case "error":
        return "destructive";
      case "pending":
        return "outline";
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/deal/${dealId}`)}
              className="mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour au deal
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Workflow Inspector</h1>
            {dealName && (
              <p className="text-muted-foreground mt-1">
                Analyse de : {dealName}
              </p>
            )}
          </div>
        </div>

        {/* Timeline */}
        {logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Aucun log de workflow disponible pour ce deal.
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map((log, index) => {
              const isExpanded = expandedLogs.has(log.id);
              const isLast = index === logs.length - 1;

              return (
                <div key={log.id} className="relative">
                  {/* Vertical line */}
                  {!isLast && (
                    <div className="absolute left-[22px] top-12 bottom-0 w-0.5 bg-border" />
                  )}

                  {/* Log card */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 relative z-10">
                      {getStatusIcon(log.status)}
                    </div>

                    <div className="flex-1 pb-8">
                      <div className="bg-card border rounded-lg overflow-hidden">
                        {/* Header */}
                        <button
                          onClick={() => toggleLogExpansion(log.id)}
                          className="w-full p-4 flex items-center justify-between hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div className="text-left">
                              <p className="font-semibold">{log.step_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(log.started_at), {
                                  addSuffix: true,
                                  locale: fr,
                                })}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {log.duration_ms && (
                              <span className="text-xs text-muted-foreground">
                                {(log.duration_ms / 1000).toFixed(2)}s
                              </span>
                            )}
                            <Badge variant={getStatusBadgeVariant(log.status)}>
                              {log.status}
                            </Badge>
                          </div>
                        </button>

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="border-t p-4 space-y-4 bg-muted/20">
                            {/* Error message */}
                            {log.error_message && (
                              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                                <p className="text-sm font-medium text-destructive mb-1">
                                  Erreur
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {log.error_message}
                                </p>
                              </div>
                            )}

                            {/* Input */}
                            {log.input && (
                              <div>
                                <p className="text-sm font-semibold mb-2">Input</p>
                                <pre className="text-xs bg-background p-3 rounded-md border overflow-x-auto">
                                  {JSON.stringify(log.input, null, 2)}
                                </pre>
                              </div>
                            )}

                            {/* Output */}
                            {log.output && (
                              <div>
                                <p className="text-sm font-semibold mb-2">Output</p>
                                <pre className="text-xs bg-background p-3 rounded-md border overflow-x-auto">
                                  {JSON.stringify(log.output, null, 2)}
                                </pre>
                              </div>
                            )}

                            {/* Timestamps */}
                            <div className="flex gap-6 text-xs text-muted-foreground">
                              <div>
                                <span className="font-medium">Démarré :</span>{" "}
                                {new Date(log.started_at).toLocaleString("fr-FR")}
                              </div>
                              {log.completed_at && (
                                <div>
                                  <span className="font-medium">Terminé :</span>{" "}
                                  {new Date(log.completed_at).toLocaleString("fr-FR")}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
