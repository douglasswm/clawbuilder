import { createServerFn } from '@tanstack/react-start';
import { getAuthenticatedClient } from './auth-helpers';

export interface AgentTemplate {
  id: string;
  name: string;
  description: string | null;
  snapshot_name: string;
}

export interface AgentTemplatesResult {
  data: AgentTemplate[];
  total: number;
  page: number;
  pageSize: number;
}

interface ListInput {
  query?: string;
  page?: number;
}

const PAGE_SIZE = 20;

export const listAgentTemplates = createServerFn({ method: 'POST' })
  .inputValidator((data: ListInput) => data)
  .handler(async (ctx): Promise<AgentTemplatesResult> => {
    const { supabase } = await getAuthenticatedClient();
    const { query = '', page = 1 } = ctx.data;

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from('agent_templates')
      .select('id, name, description, snapshot_name', { count: 'exact' })
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (query.trim()) {
      q = q.or(`name.ilike.%${query.trim()}%,description.ilike.%${query.trim()}%`);
    }

    const { data, count, error } = await q.range(from, to);

    if (error) throw new Error(error.message);

    return {
      data: (data ?? []) as AgentTemplate[],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    };
  });
