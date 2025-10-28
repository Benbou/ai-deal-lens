import { corsHeaders } from './cors.ts';

export type EventSender = (event: string, data: any) => void;
export type StreamHandler = (sendEvent: EventSender) => Promise<void>;

/**
 * Creates a Server-Sent Events (SSE) stream with proper error handling
 * @param handler - Async function that handles the streaming logic
 * @returns Response object with SSE stream
 */
export function createSSEStream(handler: StreamHandler): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let streamClosed = false;

      const sendEvent: EventSender = (event: string, data: any) => {
        if (streamClosed) {
          console.warn('⚠️ Attempted to send event after stream closed:', event);
          return;
        }
        try {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (error) {
          console.error('Error sending event:', error);
          streamClosed = true;
        }
      };

      try {
        await handler(sendEvent);
      } catch (error) {
        console.error('Streaming error:', error);
        sendEvent('error', {
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      } finally {
        // Small delay to ensure final events are sent
        await new Promise(resolve => setTimeout(resolve, 100));
        streamClosed = true;
        try {
          controller.close();
        } catch (e) {
          console.warn('Stream already closed');
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * Create a simple event sender for manual stream control
 * @param controller - ReadableStreamDefaultController
 * @returns EventSender function
 */
export function createEventSender(
  controller: ReadableStreamDefaultController,
  streamClosedRef?: { current: boolean }
): EventSender {
  const encoder = new TextEncoder();

  return (event: string, data: any) => {
    if (streamClosedRef?.current) {
      console.warn('⚠️ Attempted to send event after stream closed:', event);
      return;
    }
    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(message));
    } catch (error) {
      console.error('Error sending event:', error);
      if (streamClosedRef) {
        streamClosedRef.current = true;
      }
    }
  };
}
