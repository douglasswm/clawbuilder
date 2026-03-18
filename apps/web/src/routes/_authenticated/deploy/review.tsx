import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useWizard } from '../deploy';
import { Button } from '@workspace/ui/components/button';
import { createDeployment } from '../../../lib/server/deployments';
import { WizardNav } from '../../../components/deploy-wizard/wizard-nav';

export const Route = createFileRoute('/_authenticated/deploy/review')({
  component: ReviewStep,
});

function ReviewStep() {
  const { state } = useWizard();
  const navigate = useNavigate();
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeploy = async () => {
    if (deploying) return;
    setDeploying(true);
    setError(null);
    try {
      const result = await createDeployment({
        data: {
          name: state.name,
          region: state.region,
          size: state.size,
          primaryModel: state.primaryModel,
          personaSlug: state.persona?.slug,
          personaName: state.persona?.name,
        },
      });
      navigate({ to: '/deployments/$deploymentId', params: { deploymentId: result.deploymentId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deployment failed. Please try again.');
      setDeploying(false);
    }
  };

  return (
    <div className="space-y-6">
      <WizardNav currentStep={2} />

      <div className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="font-medium">Deployment Summary</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">Name</span>
          <span className="font-mono">{state.name}</span>
          <span className="text-muted-foreground">Region</span>
          <span>{state.region}</span>
          <span className="text-muted-foreground">Size</span>
          <span>{state.size}</span>
          <span className="text-muted-foreground">Model</span>
          <span className="capitalize">{state.primaryModel}</span>
          <span className="text-muted-foreground">Persona</span>
          <span>{state.persona?.name ?? '\u2014'}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => navigate({ to: '/deploy' })}
          disabled={deploying}
        >
          Back
        </Button>
        <Button
          onClick={handleDeploy}
          disabled={deploying}
        >
          {deploying ? 'Deploying...' : 'Deploy Agent'}
        </Button>
      </div>
    </div>
  );
}
