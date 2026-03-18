import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { getDeployments } from '../../lib/server/deployments';
import { DeploymentCard } from '../../components/deployment-card';
import { Button } from '@workspace/ui/components/button';
import type { Deployment } from '../../lib/server/deployments';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

function DashboardPage() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeployments = () => {
    setLoading(true);
    setError(null);
    getDeployments()
      .then(setDeployments)
      .catch((err) => {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load deployments.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDeployments();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700 max-w-md w-full text-center">
          <p className="font-medium mb-2">Failed to load deployments</p>
          <p className="text-red-600 mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchDeployments}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (deployments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
        <p className="text-xl font-medium">{greeting}!</p>
        <p className="text-muted-foreground">Create your first agent to get started.</p>
        <Link to="/deploy">
          <Button>Create an Agent</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{greeting}!</h1>
        <Link to="/deploy">
          <Button>New Agent</Button>
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {deployments.map((dep) => (
          <DeploymentCard key={dep.id} deployment={dep} />
        ))}
      </div>
    </div>
  );
}
