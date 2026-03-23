import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getDeploymentDetail, pollDeploymentStatus, destroyDeployment, toggleFunnel, isTailscaleAvailable, getOperationSteps, clearActiveOperation, TERMINAL_STATUSES } from '../../../lib/server/deployments';
import { TelegramConnectDialog } from '../../../components/telegram-connect-dialog';
import { StatusBadge } from '../../../components/status-badge';
import { OperationProgressBar } from '../../../components/operation-progress-bar';
import { Progress } from '@workspace/ui/components/progress';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import { MODEL_LABELS, generateSnapshotName } from '../../../lib/validation';
import { useSnapshotMutation } from '../../../hooks/useSnapshotMutation';
import { useOperationSSE } from '../../../hooks/useOperationSSE';
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
  const [funnelToggling, setFunnelToggling] = useState(false);
  const [funnelError, setFunnelError] = useState<string | null>(null);
  const [tailscaleAvailable, setTailscaleAvailable] = useState<boolean | null>(null);
  const [funnelRevealing, setFunnelRevealing] = useState(false);
  const [revealProgress, setRevealProgress] = useState(0);
  const [snapshotName, setSnapshotName] = useState('');
  const [operationStartedAt, setOperationStartedAt] = useState<number | null>(null);
  const [lastOpSteps, setLastOpSteps] = useState<Array<{ label: string; status: string; started_at: string }>>([]);
  const [showTelegramDialog, setShowTelegramDialog] = useState(false);
  const [provisionElapsed, setProvisionElapsed] = useState(0);
  const provisionStartRef = useRef<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  // Snapshot mutation hook
  const { mutate: startSnapshot, isPending: snapshotPending, mutationError: snapshotError, progress: snapshotProgress, reset: resetSnapshot } = useSnapshotMutation(deploymentId);

  // Reconnect SSE if active_operation_id exists on load
  const activeOpSSE = useOperationSSE(
    deployment?.active_operation_id && snapshotProgress.status === 'idle'
      ? deployment.active_operation_id
      : null,
    'snapshot'
  );

  // Use whichever progress is active
  const activeProgress = snapshotProgress.status !== 'idle' ? snapshotProgress : activeOpSSE;
  const hasActiveOperation = activeProgress.status === 'running' || activeProgress.status === 'pending';

  // Check if platform has Tailscale configured
  useEffect(() => {
    isTailscaleAvailable().then((res) => {
      // For user-managed deployments, use userKeyAvailable (not platform availability)
      if (isMounted.current) setTailscaleAvailable(res.userKeyAvailable ?? res.available);
    }).catch(() => {
      if (isMounted.current) setTailscaleAvailable(false);
    });
  }, []);

  const loadDeployment = useCallback(async () => {
    try {
      const dep = await getDeploymentDetail({ data: { deploymentId } });
      if (!isMounted.current) return null;
      setDeployment(dep);
      // Pre-fill snapshot name
      if (dep.name && !snapshotName) {
        setSnapshotName(generateSnapshotName(dep.name));
      }
      return dep;
    } catch (err) {
      if (!isMounted.current) return null;
      setError(err instanceof Error ? err.message : 'Failed to load deployment');
      return null;
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [deploymentId, snapshotName]);

  const poll = useCallback(async () => {
    try {
      const dep = await pollDeploymentStatus({ data: { deploymentId } });
      if (!isMounted.current) return;
      setDeployment((prev) => {
        if (!prev) return dep as Deployment;
        const next = dep as Deployment;
        if (prev.status === next.status && prev.current_step === next.current_step &&
            prev.ip_address === next.ip_address && prev.persona_pushed === next.persona_pushed &&
            prev.error_message === next.error_message && prev.step_label === next.step_label &&
            prev.tailscale_setup_status === next.tailscale_setup_status && prev.funnel_url === next.funnel_url) {
          return prev;
        }
        return next;
      });
      // Stop polling only when deployment is terminal AND funnel setup is complete (or not applicable)
      const funnelDone = !dep.tailscale_managed ||
        (dep.tailscale_setup_status !== 'pending' && dep.tailscale_setup_status !== 'in_progress');
      if (TERMINAL_STATUSES.has(dep.status) && funnelDone) {
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
      if (!isMounted.current || !dep) return;
      // Keep polling if deployment is not terminal, OR if funnel setup is still in progress
      const needsPoll = !TERMINAL_STATUSES.has(dep.status) ||
        (dep.tailscale_managed && (dep.tailscale_setup_status === 'pending' || dep.tailscale_setup_status === 'in_progress'));
      if (needsPoll) {
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

  // Elapsed time counter for provisioning
  useEffect(() => {
    const isProvisioning = deployment && !TERMINAL_STATUSES.has(deployment.status);
    if (!isProvisioning) {
      provisionStartRef.current = null;
      return;
    }
    if (!provisionStartRef.current) {
      provisionStartRef.current = Date.now();
    }
    const timer = setInterval(() => {
      if (provisionStartRef.current && isMounted.current) {
        setProvisionElapsed(Math.floor((Date.now() - provisionStartRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [deployment?.status]);

  // Load last operation steps
  useEffect(() => {
    if (!deployment?.last_operation_id) return;
    getOperationSteps({ data: { deploymentId } })
      .then((steps) => {
        if (isMounted.current && Array.isArray(steps)) {
          setLastOpSteps(steps.slice(-3));
        }
      })
      .catch(() => { /* non-fatal */ });
  }, [deployment?.last_operation_id, deploymentId]);

  // Track when snapshot operation starts
  useEffect(() => {
    if (activeProgress.status === 'running' && !operationStartedAt) {
      setOperationStartedAt(Date.now());
    }
    if (activeProgress.status === 'idle' || activeProgress.status === 'completed' || activeProgress.status === 'error') {
      setOperationStartedAt(null);
    }
  }, [activeProgress.status, operationStartedAt]);

  // Clear the operation lock and reload deployment when snapshot completes or fails
  useEffect(() => {
    if (activeProgress.status === 'completed' || activeProgress.status === 'error') {
      clearActiveOperation({ data: { deploymentId, operationId: activeProgress.operationId ?? undefined } }).finally(() => {
        loadDeployment();
      });
    }
  }, [activeProgress.status, deploymentId, loadDeployment]);

  const handleSnapshot = () => {
    if (!snapshotName.trim()) return;
    setOperationStartedAt(Date.now());
    startSnapshot({ snapshot_name: snapshotName.trim() });
  };

  const handleDestroy = async () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setDestroying(true);
    try {
      await destroyDeployment({ data: { deploymentId } });
      if (!isMounted.current) return;
      setShowDestroyConfirm(false);
      await loadDeployment();
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : 'Destroy failed');
    } finally {
      if (isMounted.current) setDestroying(false);
    }
  };

  const handleFunnelToggle = async (action: 'on' | 'off') => {
    setFunnelToggling(true);
    setFunnelError(null);
    try {
      const result = await toggleFunnel({ data: { deploymentId, action } });
      if (!isMounted.current) return;

      if (action === 'on' && result.funnelUrl) {
        setFunnelRevealing(true);
        setRevealProgress(0);
        const start = Date.now();
        const duration = 5000;
        const tick = () => {
          if (!isMounted.current) return;
          const elapsed = Date.now() - start;
          const pct = Math.min(100, Math.round((elapsed / duration) * 100));
          setRevealProgress(pct);
          if (elapsed < duration) {
            requestAnimationFrame(tick);
          } else {
            setFunnelRevealing(false);
            setDeployment((prev) => prev ? {
              ...prev,
              funnel_url: result.funnelUrl ?? undefined,
              gateway_token: result.gatewayToken ?? undefined,
              tailscale_configured: true,
              tailscale_setup_status: 'configured',
            } : prev);
          }
        };
        requestAnimationFrame(tick);
      } else {
        setDeployment((prev) => prev ? {
          ...prev,
          funnel_url: result.funnelUrl ?? undefined,
          gateway_token: result.gatewayToken ?? undefined,
          tailscale_configured: action === 'on' ? true : prev.tailscale_configured,
          tailscale_setup_status: action === 'on' ? 'configured' : prev.tailscale_setup_status,
        } : prev);
      }
    } catch (err) {
      if (!isMounted.current) return;
      setFunnelError(err instanceof Error ? err.message : `Failed to turn funnel ${action}`);
    } finally {
      if (isMounted.current) setFunnelToggling(false);
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
  const showFunnelCard = deployment.status === 'running';
  const showSnapshotCard = deployment.status === 'running' && deployment.provider === 'digitalocean';
  const showTelegramCard = deployment.status === 'running';

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* 1. HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold font-mono break-words">{deployment.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={deployment.status} />
            <span className="text-sm text-muted-foreground">
              Created {new Date(deployment.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        {canDestroy && (
          <Button
            variant="outline"
            onClick={() => setShowDestroyConfirm(true)}
            className="shrink-0 text-destructive hover:text-red-700 border-red-200 hover:border-red-300"
          >
            Destroy
          </Button>
        )}
      </div>

      {/* 2. ACTIVE OPERATION — SSE progress for snapshot/restore */}
      {hasActiveOperation && (
        <OperationProgressBar
          progress={activeProgress}
          startedAt={operationStartedAt}
          onClose={() => {
            resetSnapshot();
            setOperationStartedAt(null);
          }}
        />
      )}

      {/* Show completed/error progress bar until dismissed */}
      {!hasActiveOperation && (activeProgress.status === 'completed' || activeProgress.status === 'error') && (
        <OperationProgressBar
          progress={activeProgress}
          startedAt={null}
          onClose={() => {
            resetSnapshot();
            setOperationStartedAt(null);
          }}
        />
      )}

      {/* Deploy progress (existing polling-based) — only when no SSE operation active */}
      {isActive && !hasActiveOperation && activeProgress.status === 'idle' && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{deployment.step_label ?? 'Provisioning...'}</span>
            <span className="text-muted-foreground">
              {progressPercent}%
              {provisionElapsed > 0 && (
                <span className="ml-2">
                  {provisionElapsed >= 60
                    ? `${Math.floor(provisionElapsed / 60)}m ${provisionElapsed % 60}s`
                    : `${provisionElapsed}s`}
                </span>
              )}
            </span>
          </div>
          <Progress value={progressPercent} />
          {deployment.current_step > 0 && deployment.total_steps > 0 && (
            <p className="text-xs text-muted-foreground">
              Step {deployment.current_step} of {deployment.total_steps}
            </p>
          )}
        </div>
      )}

      {/* 3. INSTANCE INFO */}
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

      {/* 4. ACTIONS — side-by-side on desktop */}
      {(showSnapshotCard || showFunnelCard || showTelegramCard) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Snapshot Card */}
          {showSnapshotCard && !hasActiveOperation && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-base" aria-hidden="true">&#128247;</span>
                <p className="text-sm font-medium">Create Snapshot</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="snapshot-name" className="text-xs text-muted-foreground">
                  Snapshot name
                </Label>
                <Input
                  id="snapshot-name"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  placeholder="my-agent-snap-20260322"
                  className="text-sm"
                />
              </div>
              {snapshotError && (
                <p className="text-xs text-red-600">{snapshotError}</p>
              )}
              <Button
                size="sm"
                onClick={handleSnapshot}
                disabled={snapshotPending || !snapshotName.trim()}
              >
                {snapshotPending ? 'Starting...' : 'Create Snapshot'}
              </Button>
            </div>
          )}

          {/* Funnel Card */}
          {showFunnelCard && (
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-medium">Tailscale Funnel</p>
              {deployment.tailscale_managed ? (
                // Platform-managed: state machine UI
                deployment.tailscale_setup_status === 'pending' || deployment.tailscale_setup_status === 'in_progress' ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {deployment.tailscale_setup_status === 'pending'
                        ? 'Waiting for Funnel setup\u2026 This may take up to a minute.'
                        : 'Setting up public access\u2026 Configuring HTTPS endpoint.'}
                    </p>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full animate-pulse"
                        style={{
                          width: deployment.tailscale_setup_status === 'in_progress' ? '60%' : '30%',
                          transition: 'width 2s ease-in-out',
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {deployment.tailscale_setup_status === 'pending'
                        ? 'Waiting for instance to become reachable\u2026'
                        : 'Installing Tailscale and configuring Funnel\u2026'}
                    </p>
                  </div>
                ) : deployment.tailscale_setup_status === 'configured' && deployment.funnel_url ? (
                  <div className="space-y-3">
                    {/* Show warming-up notice for recently configured funnels (gateway needs 1-2 min to boot) */}
                    {(() => {
                      const updatedAt = new Date(deployment.updated_at).getTime();
                      const ageMs = Date.now() - updatedAt;
                      const isRecent = ageMs < 3 * 60 * 1000; // within 3 minutes
                      return isRecent ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-3 py-2">
                          <p className="text-xs text-amber-800 dark:text-amber-200">
                            Your agent is starting up — the URL may take 1-2 minutes to respond.
                          </p>
                        </div>
                      ) : null;
                    })()}
                    <div>
                      <p className="text-xs text-muted-foreground">Public URL</p>
                      <a
                        href={deployment.funnel_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono text-blue-600 hover:underline break-all"
                      >
                        {deployment.funnel_url}
                      </a>
                    </div>
                    {deployment.gateway_token && (
                      <div>
                        <p className="text-xs text-muted-foreground">Gateway Token</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all select-all">
                            {deployment.gateway_token}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              navigator.clipboard.writeText(deployment.gateway_token!);
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Paste this into the Gateway Token field on the dashboard</p>
                      </div>
                    )}
                    {funnelError && (
                      <p className="text-xs text-red-600">{funnelError}</p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFunnelToggle('off')}
                      disabled={funnelToggling}
                    >
                      {funnelToggling ? 'Turning off...' : 'Turn Off Funnel'}
                    </Button>
                  </div>
                ) : deployment.tailscale_setup_status === 'failed' ? (
                  <div className="space-y-3">
                    <p className="text-xs text-red-600">Funnel setup failed. You can retry below.</p>
                    {funnelError && (
                      <p className="text-xs text-red-600">{funnelError}</p>
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleFunnelToggle('on')}
                      disabled={funnelToggling}
                    >
                      {funnelToggling ? 'Retrying...' : 'Retry Funnel Setup'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Enable Tailscale Funnel for public HTTPS access to this agent.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => handleFunnelToggle('on')}
                      disabled={funnelToggling}
                    >
                      {funnelToggling ? 'Enabling...' : 'Enable Funnel'}
                    </Button>
                  </div>
                )
              ) : (
                // User-managed: existing behavior
                funnelRevealing ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Setting up public access...</p>
                    <Progress value={revealProgress} />
                    <p className="text-xs text-muted-foreground text-right">{revealProgress}%</p>
                  </div>
                ) : deployment.funnel_url ? (
                  <div className="space-y-3">
                    {/* Show warming-up notice for recently configured funnels */}
                    {(() => {
                      const updatedAt = new Date(deployment.updated_at).getTime();
                      const ageMs = Date.now() - updatedAt;
                      const isRecent = ageMs < 3 * 60 * 1000;
                      return isRecent ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-3 py-2">
                          <p className="text-xs text-amber-800 dark:text-amber-200">
                            Your agent is starting up — the URL may take 1-2 minutes to respond.
                          </p>
                        </div>
                      ) : null;
                    })()}
                    <div>
                      <p className="text-xs text-muted-foreground">Public URL</p>
                      <a
                        href={deployment.funnel_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono text-blue-600 hover:underline break-all"
                      >
                        {deployment.funnel_url}
                      </a>
                    </div>
                    {deployment.gateway_token && (
                      <div>
                        <p className="text-xs text-muted-foreground">Gateway Token</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all select-all">
                            {deployment.gateway_token}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              navigator.clipboard.writeText(deployment.gateway_token!);
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Paste this into the Gateway Token field on the dashboard</p>
                      </div>
                    )}
                    {funnelError && (
                      <p className="text-xs text-red-600">{funnelError}</p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFunnelToggle('off')}
                      disabled={funnelToggling}
                    >
                      {funnelToggling ? 'Turning off...' : 'Turn Off Funnel'}
                    </Button>
                  </div>
                ) : tailscaleAvailable === false ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Add your Tailscale auth key in{' '}
                      <a href="/settings" className="text-blue-600 hover:underline">Settings</a>{' '}
                      to enable public HTTPS access via Tailscale Funnel.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Enable Tailscale Funnel for public HTTPS access to this agent.
                    </p>
                    {funnelError && (
                      <p className="text-xs text-red-600">{funnelError}</p>
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleFunnelToggle('on')}
                      disabled={funnelToggling}
                    >
                      {funnelToggling ? 'Enabling...' : 'Enable Funnel'}
                    </Button>
                  </div>
                )
              )}
            </div>
          )}

          {/* Telegram Card */}
          {showTelegramCard && (
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-medium">Telegram</p>
              {deployment.telegram_status === 'paired' ? (
                <p className="text-xs text-green-600">Connected and paired</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Connect a Telegram bot to chat with your agent.
                  </p>
                  <Button size="sm" onClick={() => setShowTelegramDialog(true)}>
                    {deployment.telegram_status ? 'Continue Setup' : 'Connect Telegram'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Telegram Connect Dialog */}
      <TelegramConnectDialog
        open={showTelegramDialog}
        onOpenChange={setShowTelegramDialog}
        deploymentId={deploymentId}
        telegramStatus={deployment.telegram_status}
        telegramBotUsername={deployment.telegram_bot_username}
        telegramError={deployment.telegram_error}
        onStatusChange={loadDeployment}
      />

      {/* 5. LAST OPERATION */}
      {lastOpSteps.length > 0 && (
        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-sm font-medium">Last Operation</p>
          <div className="space-y-1">
            {lastOpSteps.map((step, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{step.label}</span>
                <span className={
                  step.status === 'completed' ? 'text-green-600' :
                  step.status === 'failed' ? 'text-red-600' :
                  'text-muted-foreground'
                }>
                  {step.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. PERSONA */}
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

      {/* 7. ERROR */}
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
              {destroying ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Destroying...
                </span>
              ) : 'Destroy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
