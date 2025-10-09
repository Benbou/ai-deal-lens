import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useStreamAnalysis() {
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const startAnalysis = useCallback(async (dealId: string) => {
    try {
      setIsStreaming(true);
      setStreamingText('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-deck`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ dealId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to start analysis');
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
                console.log('Status:', data.message);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e, dataStr);
            }
          }
        }
      }

      setIsStreaming(false);
      toast.success('Analyse terminée');
    } catch (error) {
      console.error('Analysis error:', error);
      setIsStreaming(false);
      toast.error('Erreur lors de l\'analyse');
    }
  }, []);

  const reset = useCallback(() => {
    setStreamingText('');
    setIsStreaming(false);
  }, []);

  return {
    streamingText,
    isStreaming,
    startAnalysis,
    reset,
  };
}
