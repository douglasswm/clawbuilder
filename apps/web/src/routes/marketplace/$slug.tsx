import { useState, useEffect } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Skeleton } from '@workspace/ui/components/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select';
import { ArrowLeft, Rocket } from '@phosphor-icons/react';
import { SUPPORTED_PROVIDERS } from '../../lib/validation';
import type { MarketplaceTemplate } from '../../lib/server/marketplace';

export const Route = createFileRoute('/marketplace/$slug')({
  component: TemplateDetailPage,
});

const PROVIDER_LABELS: Record<string, string> = {
  digitalocean: 'DigitalOcean',
  'aws-lightsail': 'AWS Lightsail',
  byteplus: 'BytePlus',
};

const PROVIDER_COLORS: Record<string, string> = {
  digitalocean: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'aws-lightsail': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  byteplus: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

const fetchTemplate = async (slug: string) => {
  const { getMarketplaceTemplateBySlug } = await import(
    '../../lib/server/marketplace'
  );
  return getMarketplaceTemplateBySlug({ data: { slug } });
};

function TemplateDetailPage() {
  const { slug } = Route.useParams();
  const [template, setTemplate] = useState<MarketplaceTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchTemplate(slug)
      .then((data) => {
        setTemplate(data);
        if (data && data.providers.length > 0) {
          setSelectedProvider(data.providers[0]);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load template');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-72" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Link
          to="/marketplace"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Marketplace
        </Link>
        <div className="text-center text-muted-foreground py-16">{error}</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Link
          to="/marketplace"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Marketplace
        </Link>
        <div className="text-center text-muted-foreground py-16">
          Template not found
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        to="/marketplace"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Marketplace
      </Link>

      {/* Template name */}
      <h1 className="text-3xl font-semibold">{template.name}</h1>

      {/* Category + provider badges */}
      <div className="flex flex-wrap items-center gap-2">
        {template.category && (
          <Badge variant="secondary">{template.category}</Badge>
        )}
        {template.providers.map((provider) => (
          <span
            key={provider}
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              PROVIDER_COLORS[provider] ??
              'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
            }`}
          >
            {PROVIDER_LABELS[provider] ?? provider}
          </span>
        ))}
      </div>

      {/* Deploy count */}
      <p className="text-sm text-muted-foreground">
        {template.deploy_count} deployments
      </p>

      {/* Description */}
      {template.description && (
        <p className="text-muted-foreground leading-relaxed">
          {template.description}
        </p>
      )}

      {/* Deploy section */}
      {(() => {
        const supportedProviders = template.providers.filter((p) => SUPPORTED_PROVIDERS.includes(p));
        const unsupportedProviders = template.providers.filter((p) => !SUPPORTED_PROVIDERS.includes(p));

        return (
          <div className="rounded-lg border border-border p-6 space-y-4">
            <h2 className="text-lg font-medium">Deploy This Agent</h2>

            {supportedProviders.length > 1 && (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="provider-select">
                  Select Provider
                </label>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger id="provider-select" className="w-full max-w-xs">
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedProviders.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {PROVIDER_LABELS[provider] ?? provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {supportedProviders.length === 1 && (
              <p className="text-sm text-muted-foreground">
                Provider: {PROVIDER_LABELS[supportedProviders[0]] ?? supportedProviders[0]}
              </p>
            )}

            {supportedProviders.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No supported providers available for deployment yet.
              </p>
            )}

            {unsupportedProviders.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Coming soon: {unsupportedProviders.map((p) => PROVIDER_LABELS[p] ?? p).join(', ')}
              </p>
            )}

            <Button asChild disabled={supportedProviders.length === 0}>
              <a
                href={supportedProviders.length > 0 ? `/deploy?template=${template.slug}&provider=${selectedProvider}` : '#'}
                className="inline-flex items-center gap-2"
              >
                <Rocket className="h-4 w-4" />
                Deploy This Agent
              </a>
            </Button>
          </div>
        );
      })()}
    </div>
  );
}
