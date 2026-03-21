import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { getSupabaseServerClient } from '../supabase.server';

export interface MarketplaceTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  providers: string[];
  thumbnail_url: string | null;
  deploy_count: number;
  created_at: string;
}

export interface MarketplaceTemplatesResult {
  data: MarketplaceTemplate[];
  total: number;
  page: number;
  pageSize: number;
}

interface ListInput {
  query?: string;
  category?: string;
  page?: number;
}

const PAGE_SIZE = 20;

/**
 * Create an anonymous (no auth) Supabase client from the current request.
 * Uses the anon key — no user session required.
 */
function getAnonymousClient() {
  const request = getRequest();
  const { supabase } = getSupabaseServerClient(request);
  return supabase;
}

export const listMarketplaceTemplates = createServerFn({ method: 'GET' })
  .inputValidator((data: ListInput) => data)
  .handler(async (ctx): Promise<MarketplaceTemplatesResult> => {
    const supabase = getAnonymousClient();
    const { query = '', category, page = 1 } = ctx.data;

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from('marketplace_templates')
      .select(
        'id, name, slug, description, category, providers, thumbnail_url, deploy_count, created_at',
        { count: 'exact' },
      )
      .order('deploy_count', { ascending: false });

    if (query.trim()) {
      // Escape SQL LIKE wildcards in user input to prevent unexpected matches
      const escaped = query.trim().replace(/[%_\\]/g, '\\$&');
      q = q.or(
        `name.ilike.%${escaped}%,description.ilike.%${escaped}%`,
      );
    }

    if (category) {
      q = q.eq('category', category);
    }

    const { data, count, error } = await q.range(from, to);

    if (error) throw new Error(error.message);

    return {
      data: (data ?? []) as MarketplaceTemplate[],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    };
  });

export const getMarketplaceTemplateBySlug = createServerFn({ method: 'GET' })
  .inputValidator((data: { slug: string }) => data)
  .handler(async (ctx): Promise<MarketplaceTemplate | null> => {
    const supabase = getAnonymousClient();
    const { slug } = ctx.data;

    const { data, error } = await supabase
      .from('marketplace_templates')
      .select(
        'id, name, slug, description, category, providers, thumbnail_url, deploy_count, created_at',
      )
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return (data as MarketplaceTemplate) ?? null;
  });
