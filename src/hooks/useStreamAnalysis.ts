import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useStreamAnalysis() {
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string>('');

  const startAnalysis = useCallback(async (dealId: string) => {
    try {
      setError(null);
      setIsStreaming(true);
      setStreamingText('');
      setCurrentStatus('Démarrage de l\'analyse...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Use supabase.functions.invoke with streaming
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-deck-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ dealId }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Analysis failed:', response.status, errorText);
        throw new Error(`Failed to start analysis: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response stream');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith(':')) continue;

          // Parse SSE format: "event: eventname" and "data: {...}"
          if (line.startsWith('event:')) {
            continue; // Skip event line, we'll get data on next line
          }

          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            try {
              const data = JSON.parse(dataStr);
              
              // Handle different event types based on data structure
              if (data.text) {
                // Delta event with text chunk
                setStreamingText(prev => prev + data.text);
              } else if (data.message) {
                // Status event with message
                setCurrentStatus(data.message);
                console.log('Status:', data.message);
              } else if (data.error) {
                // Error event
                throw new Error(data.error);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e, dataStr);
            }
          }
        }
      }

      setIsStreaming(false);
      setCurrentStatus('');
      toast.success('Analyse terminée');
    } catch (error) {
      console.error('Analysis error:', error);
      setIsStreaming(false);
      setCurrentStatus('');
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'analyse';
      setError(errorMessage);
      toast.error('L\'analyse a échoué. Notre équipe a été notifiée.');
    }
  }, []);

  const reset = useCallback(() => {
    setStreamingText('');
    setIsStreaming(false);
    setError(null);
    setCurrentStatus('');
  }, []);

  return {
    streamingText,
    isStreaming,
    error,
    currentStatus,
    startAnalysis,
    reset,
  };
}
