import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Input } from '@workspace/ui/components/input';
import { Badge } from '@workspace/ui/components/badge';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Button } from '@workspace/ui/components/button';
import { MagnifyingGlass, Rocket, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useTemplateList } from '../../hooks/use-template-list';
import type { MarketplaceTemplate } from '../../lib/server/marketplace';

export const Route = createFileRoute('/marketplace/')({
  component: MarketplacePage,
});

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'customer-support', label: 'Customer Support' },
  { value: 'sales', label: 'Sales' },
  { value: 'content', label: 'Content' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'data-analysis', label: 'Data Analysis' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'research', label: 'Research' },
] as const;

const PROVIDER_COLORS: Record<string, string> = {
  digitalocean: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'aws-lightsail': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  byteplus: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

const fetchFn = async ({
  query,
  page,
  category,
}: {
  query: string;
  page: number;
  category?: string;
}) => {
  const { listMarketplaceTemplates } = await import(
    '../../lib/server/marketplace'
  );
  return listMarketplaceTemplates({ data: { query, category, page } });
};

function MarketplacePage() {
  const [category, setCategory] = useState('');

  const {
    query,
    setQuery,
    templates,
    loading,
    error,
    page,
    setPage,
    totalPages,
    hasPrev,
    hasNext,
  } = useTemplateList<MarketplaceTemplate>({
    fetchFn,
    category: category || undefined,
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold">Agent Marketplace</h1>
        <p className="text-muted-foreground mt-1">
          Browse and deploy pre-built AI agent templates
        </p>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => {
              setCategory(cat.value);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              category === cat.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="text-center text-muted-foreground py-8">{error}</div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && templates.length === 0 && (
        <div className="text-center text-muted-foreground py-16">
          No templates found
        </div>
      )}

      {/* Template card grid */}
      {!loading && !error && templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="rounded-lg border border-border p-4 flex flex-col gap-3 hover:border-primary hover:bg-accent/50 transition-colors"
            >
              <a
                href={`/marketplace/${template.slug}`}
                className="flex flex-col gap-2 flex-1"
              >
                <div className="font-medium">{template.name}</div>
                {template.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-2">
                  {template.category && (
                    <Badge variant="secondary" className="text-xs">
                      {template.category}
                    </Badge>
                  )}
                  {template.providers.map((provider) => (
                    <span
                      key={provider}
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        PROVIDER_COLORS[provider] ??
                        'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {provider}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {template.deploy_count} deploys
                </span>
              </a>
              <a
                href={`/deploy?template=${template.slug}`}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Rocket className="h-4 w-4" />
                Deploy This Agent
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setPage((p) => p - 1)}
          >
            <CaretLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <CaretRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
