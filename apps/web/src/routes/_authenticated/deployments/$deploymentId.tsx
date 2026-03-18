import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/deployments/$deploymentId')({
  component: DeploymentDetailPage,
});

function DeploymentDetailPage() {
  const { deploymentId } = Route.useParams();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Deployment Detail</h1>
      <p className="text-muted-foreground mt-2">Deployment ID: {deploymentId}</p>
      <p className="text-sm text-muted-foreground mt-1">Full implementation in Task 6.</p>
    </div>
  );
}
