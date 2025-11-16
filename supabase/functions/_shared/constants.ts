/**
 * Shared constants for Edge Functions
 * Centralized configuration values to avoid magic numbers and improve maintainability
 */

// ============================================================================
// TIMEOUTS & DURATIONS
// ============================================================================

/** Timeout for SSE streams from Claude (10 minutes) */
export const SSE_STREAM_TIMEOUT_MS = 10 * 60 * 1000;

/** Timeout for OCR processing (5 minutes) */
export const OCR_TIMEOUT_MS = 5 * 60 * 1000;

/** Timeout for quick context extraction (30 seconds) */
export const QUICK_EXTRACT_TIMEOUT_MS = 30 * 1000;

/** Timeout for finalization step (30 seconds) */
export const FINALIZATION_TIMEOUT_MS = 30 * 1000;

/** Delay before closing stream after completion (ms) */
export const STREAM_CLOSE_DELAY_MS = 100;

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/** Progress milestones for orchestrator pipeline */
export const PROGRESS = {
  INIT: 0,
  OCR_START: 10,
  OCR_COMPLETE: 25,
  QUICK_EXTRACT_START: 30,
  QUICK_EXTRACT_COMPLETE: 40,
  CONTEXT_READY: 45,
  MEMO_START: 45,
  MEMO_STREAMING: 50,
  MEMO_COMPLETE: 85,
  FINALIZATION_START: 85,
  FINALIZATION_PROGRESS: 95,
  COMPLETE: 100,
} as const;

/** Total number of pipeline steps */
export const TOTAL_PIPELINE_STEPS = 4;

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

/** Maximum number of retries for failed API calls */
export const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
export const RETRY_BASE_DELAY_MS = 1000;

/** Maximum delay for exponential backoff (ms) */
export const RETRY_MAX_DELAY_MS = 10000;

// ============================================================================
// API CONFIGURATION
// ============================================================================

/** Signed URL expiration time (1 hour) */
export const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

/** Maximum file size for PDF uploads (50MB) */
export const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024;

// ============================================================================
// LOGGING PREFIXES
// ============================================================================

export const LOG_PREFIX = {
  ORCHESTRATOR: '[ORCHESTRATOR]',
  OCR: '[OCR]',
  QUICK_EXTRACT: '[QUICK_EXTRACT]',
  MEMO: '[MEMO]',
  FINALIZE: '[FINALIZE]',
  ADMIN_ALERT: '[ADMIN_ALERT]',
  WHATSAPP: '[WHATSAPP]',
  SSE: '[SSE]',
  ERROR: '[ERROR]',
  INFO: '[INFO]',
  INIT: '[INIT]',
  START: '[START]',
  STEP: '[STEP]',
  END: '[END]',
  TIMEOUT: '[TIMEOUT]',
} as const;

// ============================================================================
// STATUS MESSAGES (French)
// ============================================================================

export const STATUS_MESSAGES = {
  OCR_START: '📄 Étape 1/4 : Extraction du texte du pitch deck (OCR)...',
  OCR_COMPLETE: '✅ Texte extrait avec succès',
  QUICK_EXTRACT_START: '🔍 Étape 2/4 : Analyse rapide du contexte (données clés)...',
  QUICK_EXTRACT_COMPLETE: '✅ Contexte disponible, génération du mémo détaillé...',
  MEMO_START: '🤖 Étape 3/4 : Analyse approfondie avec Claude AI (recherches web + génération du mémo)...',
  MEMO_COMPLETE: '✅ Mémo d\'investissement généré avec succès',
  FINALIZE_START: '💾 Étape 4/4 : Mise à jour du dashboard...',
  ANALYSIS_COMPLETE: '✅ Analyse terminée avec succès',
} as const;

// ============================================================================
// ANALYSIS STATUSES
// ============================================================================

export const ANALYSIS_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type AnalysisStatus = typeof ANALYSIS_STATUS[keyof typeof ANALYSIS_STATUS];

// ============================================================================
// DEAL STATUSES
// ============================================================================

export const DEAL_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type DealStatus = typeof DEAL_STATUS[keyof typeof DEAL_STATUS];

// ============================================================================
// SSE EVENT TYPES
// ============================================================================

export const SSE_EVENT_TYPE = {
  STATUS: 'status',
  DELTA: 'delta',
  QUICK_CONTEXT: 'quick_context',
  DONE: 'done',
  ERROR: 'error',
  PROGRESS: 'progress',
} as const;

export type SSEEventType = typeof SSE_EVENT_TYPE[keyof typeof SSE_EVENT_TYPE];

// ============================================================================
// ERROR MESSAGES
// ============================================================================

export const ERROR_MESSAGES = {
  NO_AUTH_HEADER: 'No authorization header',
  MISSING_DEAL_ID: 'dealId is required',
  DEAL_NOT_FOUND: 'Deal not found or access denied',
  ANALYSIS_CREATE_FAILED: 'Failed to create analysis record',
  OCR_FAILED: 'OCR processing failed',
  QUICK_EXTRACT_FAILED: 'Quick extract failed',
  MEMO_FAILED: 'Memo generation failed',
  NO_RESPONSE_STREAM: 'No response stream from Claude',
  SSE_TIMEOUT: 'SSE stream timeout after 10 minutes',
  NO_DATA_EXTRACTED: 'Claude failed to extract data',
  FINALIZATION_FAILED: 'Finalization failed',
} as const;
