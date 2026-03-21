import { useState, useEffect, useCallback, useRef } from 'react';

export interface TemplateListPage<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UseTemplateListOptions<T> {
  fetchFn: (params: { query: string; page: number; category?: string }) => Promise<TemplateListPage<T>>;
  category?: string;
  enabled?: boolean;
}

export interface UseTemplateListReturn<T> {
  query: string;
  setQuery: (q: string) => void;
  templates: T[];
  loading: boolean;
  error: string | null;
  page: number;
  setPage: (p: number | ((prev: number) => number)) => void;
  total: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function useTemplateList<T>({
  fetchFn,
  category,
  enabled = true,
}: UseTemplateListOptions<T>): UseTemplateListReturn<T> {
  const [query, setQueryRaw] = useState('');
  const [templates, setTemplates] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  const setQuery = useCallback((q: string) => {
    setQueryRaw(q);
    setPage(1);
  }, []);

  const loadTemplates = useCallback(
    (q: string, p: number, cat?: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        setError(null);
        try {
          const result = await fetchFn({ query: q, page: p, category: cat });
          setTemplates(result.data);
          setTotal(result.total);
          setPageSize(result.pageSize);
        } catch {
          setError('Failed to load templates');
          setTemplates([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [fetchFn],
  );

  useEffect(() => {
    if (!enabled) return;
    loadTemplates(query, page, category);
  }, [enabled, query, page, category, loadTemplates]);

  return {
    query,
    setQuery,
    templates,
    loading,
    error,
    page,
    setPage,
    total,
    pageSize,
    totalPages,
    hasNext,
    hasPrev,
  };
}
