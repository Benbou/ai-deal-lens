import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthResult {
  user: any;
  supabaseClient: SupabaseClient;
  deal?: any;
}

export interface AuthError {
  error: string;
  status: number;
}

/**
 * Authenticate user and optionally verify deal ownership
 * @param authHeader - Authorization header from request
 * @param dealId - Optional deal ID to verify ownership
 * @returns AuthResult or AuthError
 */
export async function authenticateAndAuthorize(
  authHeader: string | null,
  dealId?: string
): Promise<{ success: true; data: AuthResult } | { success: false; error: AuthError }> {
  if (!authHeader) {
    return {
      success: false,
      error: {
        error: 'No authorization header',
        status: 401
      }
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    global: {
      headers: { Authorization: authHeader }
    }
  });

  // Get authenticated user
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: {
        error: 'Invalid authentication',
        status: 401
      }
    };
  }

  // If dealId provided, verify ownership
  if (dealId) {
    const { data: deal, error: dealError } = await supabaseClient
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return {
        success: false,
        error: {
          error: 'Deal not found',
          status: 404
        }
      };
    }

    if (deal.user_id !== user.id) {
      return {
        success: false,
        error: {
          error: 'Access denied',
          status: 403
        }
      };
    }

    return {
      success: true,
      data: {
        user,
        supabaseClient,
        deal
      }
    };
  }

  return {
    success: true,
    data: {
      user,
      supabaseClient
    }
  };
}

/**
 * Create a Supabase client with service role key (for operations not bound to a user)
 */
export function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Create a Supabase client with user auth token
 */
export function createAuthenticatedClient(authHeader: string): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  return createClient(supabaseUrl, supabaseServiceKey, {
    global: {
      headers: { Authorization: authHeader }
    }
  });
}
