import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getDeploymentDetail, pollDeploymentStatus, destroyDeployment, TERMINAL_STATUSES } from '../../../lib/server/deployments';
import { StatusBadge } from '../../../components/status-badge';
import { Progress } from '@workspace/ui/components/progress';
import { Button } from '@workspace/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import { MODEL_LABELS } from '../../../lib/validation';
import type { Deployment } from '../../../lib/server/deployments';

export const Route = createFileRoute('/_authenticated/deployments/$deploymentId')({
  component: DeploymentDetailPage,
});

function DeploymentDetailPage() {
  const { deploymentId } = Route.useParams();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);
  const [destroying, setDestroying] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  const loadDeployment = useCallback(async () => {
    try {
      const dep = await getDeploymentDetail({ data: { deploymentId } });
      if (!isMounted.current) return null;
      setDeployment(dep);
      return dep;
    } catch (err) {
      if (!isMounted.current) return null;
      setError(err instanceof Error ? err.message : 'Failed to load deployment');
      return null;
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [deploymentId]);

  const poll = useCallback(async () => {
    try {
      const dep = await pollDeploymentStatus({ data: { deploymentId } });
      if (!isMounted.current) return;
      setDeployment((prev) => {
        if (!prev) return dep as Deployment;
        const next = dep as Deployment;
        if (prev.status === next.status && prev.current_step === next.current_step &&
            prev.ip_address === next.ip_address && prev.persona_pushed === next.persona_pushed &&
            prev.error_message === next.error_message && prev.step_label === next.step_label) {
          return prev;
        }
        return next;
      });
      if (TERMINAL_STATUSES.has(dep.status)) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch {
      // Polling errors are non-fatal
    }
  }, [deploymentId]);

  useEffect(() => {
    isMounted.current = true;
    loadDeployment().then((dep) => {
      if (isMounted.current && dep && !TERMINAL_STATUSES.has(dep.status)) {
        pollingRef.current = setInterval(poll, 10_000);
      }
    });
    return () => {
      isMounted.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [loadDeployment, poll]);

  const handleDestroy = async () => {
    // Clear polling immediately to prevent stale polls during destroy
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setDestroying(true);
    try {
      await destroyDeployment({ data: { deploymentId } });
      if (!isMounted.current) return;
      setShowDestroyConfirm(false);
      // Reload to show destroyed status
      await loadDeployment();
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : 'Destroy failed');
    } finally {
      if (isMounted.current) setDestroying(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-64" />
        <div className="h-4 bg-muted rounded w-32" />
        <div className="h-2 bg-muted rounded" />
      </div>
    );
  }

  if (error && !deployment) {
    return (
      <div className="p-6 text-red-600">{error}</div>
    );
  }

  if (!deployment) return null;

  const progressPercent = deployment.total_steps > 0
    ? Math.round((deployment.current_step / deployment.total_steps) * 100)
    : 0;

  const isActive = !TERMINAL_STATUSES.has(deployment.status);
  const canDestroy = !['destroyed', 'destroying'].includes(deployment.status);

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold font-mono">{deployment.name}</h1>
            <StatusBadge status={deployment.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Created {new Date(deployment.created_at).toLocaleDateString()}
          </p>
        </div>
        {canDestroy && (
          <Button
            variant="outline"
            onClick={() => setShowDestroyConfirm(true)}
            className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
          >
            Destroy
          </Button>
        )}
      </div>

      {isActive && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{deployment.step_label ?? 'Provisioning...'}</span>
            <span className="text-muted-foreground">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Region</p>
          <p>{deployment.region}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Size</p>
          <p>{deployment.size}</p>
        </div>
        {deployment.primary_model && (
          <div>
            <p className="text-muted-foreground">Model</p>
            <p>{MODEL_LABELS[deployment.primary_model] ?? deployment.primary_model}</p>
          </div>
        )}
        {deployment.ip_address && (
          <div>
            <p className="text-muted-foreground">IP Address</p>
            <p className="font-mono">{deployment.ip_address}</p>
          </div>
        )}
      </div>

      {deployment.persona_name && (
        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-sm font-medium">Persona: {deployment.persona_name}</p>
          {deployment.persona_pushed && (
            <p className="text-xs text-green-600">Persona pushed successfully</p>
          )}
          {deployment.persona_error && (
            <p className="text-xs text-red-600">Persona push failed: {deployment.persona_error}</p>
          )}
          {!deployment.persona_pushed && !deployment.persona_error && (
            <p className="text-xs text-muted-foreground">Persona will be pushed when deployment is running</p>
          )}
        </div>
      )}

      {deployment.error_message && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {deployment.error_message}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Dialog open={showDestroyConfirm} onOpenChange={setShowDestroyConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Destroy {deployment.name}?</DialogTitle>
            <DialogDescription>
              This will permanently destroy the agent and its cloud resources. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDestroyConfirm(false)} disabled={destroying}>
              Cancel
            </Button>
            <Button
              onClick={handleDestroy}
              disabled={destroying}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {destroying ? 'Destroying...' : 'Destroy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
