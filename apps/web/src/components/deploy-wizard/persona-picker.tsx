import { useState, useEffect, useCallback, useRef } from 'react';
import { createServerFn } from '@tanstack/react-start';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import { Input } from '@workspace/ui/components/input';
import { Badge } from '@workspace/ui/components/badge';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Button } from '@workspace/ui/components/button';

export interface SelectedPersona {
  slug: string;
  name: string;
}

interface FetchInput {
  query?: string;
  page?: number;
}

const fetchAgentTemplates = createServerFn({ method: 'POST' })
  .inputValidator((data: FetchInput) => data)
  .handler(async (ctx) => {
    const { listAgentTemplates } = await import('../../lib/server/agent-templates');
    return listAgentTemplates({ data: ctx.data });
  });

interface PersonaPickerProps {
  mode?: 'inline' | 'dialog';
  selectedSlug?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect: (persona: SelectedPersona | null) => void;
  disabled?: boolean;
}

export function PersonaPicker({
  mode = 'dialog',
  selectedSlug,
  open,
  onOpenChange,
  onSelect,
  disabled,
}: PersonaPickerProps) {
  const [query, setQuery] = useState('');
  const [templates, setTemplates] = useState<
    Array<{ id: string; name: string; description: string | null; snapshot_name: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = mode === 'inline' ? true : !!open;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadTemplates = useCallback((q: string, p: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAgentTemplates({ data: { query: q, page: p } });
        setTemplates(result.data);
        setTotal(result.total);
        setPageSize(result.pageSize);
      } catch {
        setError('Failed to load agent templates');
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    loadTemplates(query, page);
  }, [isActive, query, page, loadTemplates]);

  // Reset to page 1 when query changes
  useEffect(() => {
    setPage(1);
  }, [query]);

  const handleSelect = (template: (typeof templates)[0]) => {
    if (disabled || loading) return;
    onSelect({ slug: template.snapshot_name, name: template.name });
    if (mode === 'dialog') onOpenChange?.(false);
  };

  const selectedTemplate = selectedSlug
    ? templates.find((t) => t.snapshot_name === selectedSlug)
    : null;

  const content = (
    <div className={mode === 'inline' ? 'space-y-4' : ''}>
      {/* Selected template card (inline mode only) */}
      {mode === 'inline' && selectedTemplate && (
        <div className="rounded-lg border-2 border-primary bg-accent/50 p-4 flex items-start justify-between transition-all animate-in fade-in slide-in-from-top-1 duration-200">
          <div>
            <div className="font-medium">{selectedTemplate.name}</div>
            {selectedTemplate.description && (
              <div className="text-sm text-muted-foreground mt-1">
                {selectedTemplate.description}
              </div>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
            Change
          </Button>
        </div>
      )}

      {/* Selected slug but template not loaded yet (inline mode) */}
      {mode === 'inline' && selectedSlug && !selectedTemplate && !loading && (
        <div className="rounded-lg border-2 border-primary bg-accent/50 p-4 flex items-center justify-between">
          <span className="font-medium font-mono text-sm">{selectedSlug}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
            Change
          </Button>
        </div>
      )}

      <Input
        placeholder="Search agent templates..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={mode === 'dialog' ? 'mt-2' : ''}
      />

      <div className={mode === 'dialog' ? 'flex-1 overflow-y-auto mt-4' : 'mt-4'}>
        {error && <div className="text-center text-muted-foreground py-8">{error}</div>}

        {loading && !error && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        )}

        {!loading && !error && templates.length === 0 && (
          <div className="text-center text-muted-foreground py-8">No agent templates found</div>
        )}

        {!loading && !error && templates.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => handleSelect(template)}
                disabled={disabled || loading}
                className={`text-left p-3 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedSlug === template.snapshot_name
                    ? 'border-primary bg-accent ring-1 ring-primary/20'
                    : 'border-border hover:border-primary hover:bg-accent'
                }`}
              >
                <div className="font-medium text-sm">{template.name}</div>
                {template.description && (
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {template.description}
                  </div>
                )}
                <Badge variant="secondary" className="mt-2 text-xs">
                  {template.snapshot_name}
                </Badge>
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Deploy without template link (inline mode only) */}
      {mode === 'inline' && selectedSlug && (
        <div className="text-center pt-2">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
            onClick={() => onSelect(null)}
          >
            Deploy without a template
          </button>
        </div>
      )}
    </div>
  );

  if (mode === 'inline') return content;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose an Agent Template</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
