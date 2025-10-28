/**
 * Sanitize a value to be a valid number or null
 * Converts string representations of null to actual null
 * Handles edge cases like empty strings, "null", "undefined"
 */
export function sanitizeNumericValue(value: any): number | null {
  // Case 1: null-like values
  if (value === null || value === undefined) return null;
  if (value === "null" || value === "undefined" || value === "") return null;

  // Case 2: string representing a number
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === "null" || trimmed === "undefined") return null;
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? null : parsed;
  }

  // Case 3: already a number
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }

  // Case 4: other types (object, array, etc.)
  return null;
}

/**
 * Sanitize a string value
 * Returns null if the value is not a valid non-empty string
 */
export function sanitizeStringValue(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Validate and sanitize extracted data from AI
 * Ensures proper types for all fields
 */
export interface ExtractedData {
  company_name?: string;
  sector?: string;
  solution_summary?: string;
  amount_raised_cents?: number;
  pre_money_valuation_cents?: number;
  current_arr_cents?: number;
  yoy_growth_percent?: number;
  mom_growth_percent?: number;
}

export interface SanitizedData {
  company_name: string | null;
  sector: string | null;
  solution_summary: string | null;
  amount_raised_cents: number | null;
  pre_money_valuation_cents: number | null;
  current_arr_cents: number | null;
  yoy_growth_percent: number | null;
  mom_growth_percent: number | null;
}

export function sanitizeExtractedData(data: ExtractedData): SanitizedData {
  return {
    company_name: sanitizeStringValue(data.company_name),
    sector: sanitizeStringValue(data.sector),
    solution_summary: sanitizeStringValue(data.solution_summary),
    amount_raised_cents: sanitizeNumericValue(data.amount_raised_cents),
    pre_money_valuation_cents: sanitizeNumericValue(data.pre_money_valuation_cents),
    current_arr_cents: sanitizeNumericValue(data.current_arr_cents),
    yoy_growth_percent: sanitizeNumericValue(data.yoy_growth_percent),
    mom_growth_percent: sanitizeNumericValue(data.mom_growth_percent),
  };
}

/**
 * Prepare data for database update
 * Only includes non-null values to avoid overwriting existing data
 */
export function prepareDataForUpdate(sanitizedData: SanitizedData): Record<string, any> {
  const update: Record<string, any> = {};
  let fieldCount = 0;

  // String fields
  if (sanitizedData.company_name !== null) {
    update.company_name = sanitizedData.company_name;
    fieldCount++;
  }
  if (sanitizedData.sector !== null) {
    update.sector = sanitizedData.sector;
    fieldCount++;
  }
  if (sanitizedData.solution_summary !== null) {
    update.solution_summary = sanitizedData.solution_summary;
    fieldCount++;
  }

  // Numeric fields - only include if not null
  if (sanitizedData.amount_raised_cents !== null) {
    update.amount_raised_cents = sanitizedData.amount_raised_cents;
    fieldCount++;
  }
  if (sanitizedData.pre_money_valuation_cents !== null) {
    update.pre_money_valuation_cents = sanitizedData.pre_money_valuation_cents;
    fieldCount++;
  }
  if (sanitizedData.current_arr_cents !== null) {
    update.current_arr_cents = sanitizedData.current_arr_cents;
    fieldCount++;
  }
  if (sanitizedData.yoy_growth_percent !== null) {
    update.yoy_growth_percent = sanitizedData.yoy_growth_percent;
    fieldCount++;
  }
  if (sanitizedData.mom_growth_percent !== null) {
    update.mom_growth_percent = sanitizedData.mom_growth_percent;
    fieldCount++;
  }

  return { update, fieldCount };
}
