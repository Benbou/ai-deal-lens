/**
 * Shared TypeScript types for Edge Functions
 * Centralized type definitions for better type safety and maintainability
 */

import { AnalysisStatus, DealStatus, SSEEventType } from './constants.ts';

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface AnalyzeOrchestratorRequest {
  dealId: string;
}

export interface ProcessOCRRequest {
  dealId: string;
}

export interface ProcessOCRResponse {
  success: boolean;
  markdownText: string;
  characterCount: number;
  error?: string;
}

export interface QuickExtractRequest {
  dealId: string;
  ocrText: string;
}

export interface QuickExtractResponse {
  quickData: QuickContextData;
}

export interface GenerateMemoRequest {
  dealId: string;
  markdownText: string;
  analysisId: string;
}

export interface FinalizeAnalysisRequest {
  dealId: string;
  analysisId: string;
  extractedData: ExtractedDealData;
}

export interface FinalizeAnalysisResponse {
  success: boolean;
  fieldsUpdated?: number;
  error?: string;
}

export interface SendAdminAlertRequest {
  dealId: string;
  error: string;
  step?: string;
  timestamp: string;
  stackTrace?: string;
}

export interface SendAdminAlertResponse {
  success: boolean;
  emailId?: string;
  error?: string;
}

// ============================================================================
// SSE EVENT TYPES
// ============================================================================

export interface SSEStatusEvent {
  message: string;
  progress: number;
  step: number;
  totalSteps: number;
}

export interface SSEDeltaEvent {
  text: string;
}

export interface SSEQuickContextEvent {
  data: QuickContextData;
  progress: number;
}

export interface SSEDoneEvent {
  success: true;
}

export interface SSEErrorEvent {
  message: string;
}

export type SSEEventData =
  | SSEStatusEvent
  | SSEDeltaEvent
  | SSEQuickContextEvent
  | SSEDoneEvent
  | SSEErrorEvent;

// ============================================================================
// DATA EXTRACTION TYPES
// ============================================================================

export interface QuickContextData {
  company_name?: string;
  sector?: string;
  solution_summary?: string;
  stage?: string;
  amount_raised?: string;
  team_size?: number;
}

export interface ExtractedDealData {
  // Core fields
  company_name?: string;
  sector?: string;
  solution_summary?: string;
  stage?: string;

  // Financial metrics (in cents)
  amount_raised_cents?: number;
  pre_money_valuation_cents?: number;
  post_money_valuation_cents?: number;
  current_arr_cents?: number;
  current_mrr_cents?: number;

  // Growth metrics (as percentages)
  yoy_growth_percent?: number;
  mom_growth_percent?: number;

  // Team & operations
  team_size?: number;
  founding_year?: number;
  country?: string;
  city?: string;

  // Currency
  currency?: string;

  // Additional context
  target_market?: string;
  business_model?: string;
  competitors?: string[];
  key_milestones?: string[];
}

// ============================================================================
// DATABASE RECORD TYPES
// ============================================================================

export interface DealRecord {
  id: string;
  user_id: string;
  startup_name: string;
  company_name?: string;
  sector: string;
  stage?: string;
  status: DealStatus;
  amount_raised_cents?: number;
  pre_money_valuation_cents?: number;
  current_arr_cents?: number;
  yoy_growth_percent?: number;
  mom_growth_percent?: number;
  solution_summary?: string;
  currency?: string;
  analysis_started_at?: string;
  analysis_completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AnalysisRecord {
  id: string;
  deal_id: string;
  status: AnalysisStatus;
  current_step?: string;
  progress_percent: number;
  quick_context?: QuickContextData;
  result?: AnalysisResult;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  created_at: string;
  updated_at: string;
}

export interface AnalysisResult {
  status: string;
  full_text?: string;
  summary?: string;
  metadata?: {
    iterations?: number;
    total_tokens?: number;
    linkup_searches_count?: number;
    processing_time_ms?: number;
  };
  linkup_searches?: Array<{
    query: string;
    depth: string;
    timestamp?: string;
  }>;
}

export interface DeckFileRecord {
  id: string;
  deal_id: string;
  file_name: string;
  storage_path: string;
  file_size_bytes: number;
  mime_type: string;
  ocr_markdown?: string;
  uploaded_at: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface LogContext {
  dealId?: string;
  analysisId?: string;
  step?: string;
  duration?: number;
  [key: string]: any;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface TimeoutOptions {
  timeoutMs: number;
  onTimeout?: () => void;
}

// ============================================================================
// HELPER TYPE GUARDS
// ============================================================================

export function isValidDealStatus(status: string): status is DealStatus {
  return ['draft', 'pending', 'processing', 'completed', 'failed'].includes(status);
}

export function isValidAnalysisStatus(status: string): status is AnalysisStatus {
  return ['pending', 'queued', 'processing', 'completed', 'failed'].includes(status);
}

export function isValidSSEEventType(eventType: string): eventType is SSEEventType {
  return ['status', 'delta', 'quick_context', 'done', 'error', 'progress'].includes(eventType);
}
