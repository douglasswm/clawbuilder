import { getRequest } from '@tanstack/react-start/server';
import { getSupabaseServerClient } from '../supabase.server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export interface AuthenticatedClient {
  supabase: SupabaseClient;
  user: User;
  headers: Headers;
}

/**
 * Get an authenticated Supabase client from the current server request.
 * Throws a Response with status 401 if the user is not authenticated.
 */
export async function getAuthenticatedClient(): Promise<AuthenticatedClient> {
  const request = getRequest();
  const { supabase, headers } = getSupabaseServerClient(request);

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Response('Unauthorized', { status: 401 });
  }

  return { supabase, user, headers };
}
