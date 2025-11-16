/**
 * Error handling and retry utilities for Edge Functions
 * Provides robust error handling, retry logic, and timeout management
 */

import { RetryOptions, TimeoutOptions } from './types.ts';
import { MAX_RETRIES, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS } from './constants.ts';

// ============================================================================
// RETRY LOGIC WITH EXPONENTIAL BACKOFF
// ============================================================================

/**
 * Executes a function with retry logic and exponential backoff
 * @param fn - Async function to execute
 * @param options - Retry configuration options
 * @returns Promise with the function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const {
    maxRetries = MAX_RETRIES,
    baseDelayMs = RETRY_BASE_DELAY_MS,
    maxDelayMs = RETRY_MAX_DELAY_MS,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = Math.min(
        baseDelayMs * Math.pow(2, attempt),
        maxDelayMs
      );
      const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
      const delay = exponentialDelay + jitter;

      console.warn(
        `Retry attempt ${attempt + 1}/${maxRetries} after ${delay.toFixed(0)}ms. Error: ${lastError.message}`
      );

      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError!;
}

// ============================================================================
// TIMEOUT MANAGEMENT
// ============================================================================

/**
 * Wraps a promise with a timeout
 * @param promise - Promise to wrap
 * @param options - Timeout configuration
 * @returns Promise that rejects if timeout is exceeded
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  options: TimeoutOptions
): Promise<T> {
  const { timeoutMs, onTimeout } = options;

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        if (onTimeout) {
          onTimeout();
        }
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/**
 * Determines if an error is retryable
 * @param error - Error to check
 * @returns True if error should be retried
 */
export function isRetryableError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();

  // Network errors are retryable
  const networkErrors = [
    'network',
    'timeout',
    'econnrefused',
    'econnreset',
    'etimedout',
    'socket',
    'fetch failed',
  ];

  if (networkErrors.some(term => errorMessage.includes(term))) {
    return true;
  }

  // HTTP 5xx errors are retryable (server errors)
  if (errorMessage.includes('status: 5')) {
    return true;
  }

  // HTTP 429 (rate limit) is retryable
  if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
    return true;
  }

  // HTTP 408 (request timeout) is retryable
  if (errorMessage.includes('408')) {
    return true;
  }

  return false;
}

/**
 * Categorizes error for logging and monitoring
 * @param error - Error to categorize
 * @returns Error category string
 */
export function categorizeError(error: Error): string {
  const errorMessage = error.message.toLowerCase();

  if (errorMessage.includes('timeout')) return 'TIMEOUT';
  if (errorMessage.includes('network')) return 'NETWORK';
  if (errorMessage.includes('auth')) return 'AUTH';
  if (errorMessage.includes('not found')) return 'NOT_FOUND';
  if (errorMessage.includes('permission') || errorMessage.includes('denied'))
    return 'PERMISSION';
  if (errorMessage.includes('validation')) return 'VALIDATION';
  if (errorMessage.includes('rate limit')) return 'RATE_LIMIT';
  if (errorMessage.includes('parse') || errorMessage.includes('json'))
    return 'PARSE_ERROR';

  return 'UNKNOWN';
}

// ============================================================================
// ERROR FORMATTING
// ============================================================================

/**
 * Formats error for user-friendly display
 * @param error - Error to format
 * @returns User-friendly error message
 */
export function formatUserError(error: Error): string {
  const category = categorizeError(error);

  switch (category) {
    case 'TIMEOUT':
      return 'L\'opération a pris trop de temps. Veuillez réessayer.';
    case 'NETWORK':
      return 'Erreur de connexion réseau. Vérifiez votre connexion internet.';
    case 'AUTH':
      return 'Erreur d\'authentification. Veuillez vous reconnecter.';
    case 'NOT_FOUND':
      return 'Ressource non trouvée.';
    case 'PERMISSION':
      return 'Vous n\'avez pas les permissions nécessaires.';
    case 'VALIDATION':
      return 'Données invalides. Veuillez vérifier votre saisie.';
    case 'RATE_LIMIT':
      return 'Trop de requêtes. Veuillez patienter quelques instants.';
    case 'PARSE_ERROR':
      return 'Erreur lors du traitement des données.';
    default:
      return 'Une erreur inattendue s\'est produite. Notre équipe a été notifiée.';
  }
}

/**
 * Extracts relevant error details for logging
 * @param error - Error to extract details from
 * @returns Object with error details
 */
export function extractErrorDetails(error: Error): Record<string, any> {
  return {
    message: error.message,
    name: error.name,
    category: categorizeError(error),
    stack: error.stack,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sleep for specified milliseconds
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safe JSON parse with error handling
 * @param jsonString - JSON string to parse
 * @param fallback - Fallback value if parse fails
 * @returns Parsed object or fallback
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.warn('JSON parse failed, using fallback:', error);
    return fallback;
  }
}

/**
 * Validates required environment variables
 * @param requiredVars - Array of required env var names
 * @throws Error if any required var is missing
 */
export function validateEnvVars(requiredVars: string[]): void {
  const missing = requiredVars.filter(varName => !Deno.env.get(varName));

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/**
 * Creates a structured error with additional context
 * @param message - Error message
 * @param context - Additional context
 * @returns Error with context
 */
export function createContextualError(
  message: string,
  context: Record<string, any>
): Error {
  const error = new Error(message);
  Object.assign(error, { context });
  return error;
}
