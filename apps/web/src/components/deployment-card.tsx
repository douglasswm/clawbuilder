import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { StatusBadge } from './status-badge';
import type { Deployment } from '../lib/server/deployments';

interface DeploymentCardProps {
  deployment: Deployment;
}

export function DeploymentCard({ deployment }: DeploymentCardProps) {
  return (
    <Link to="/deployments/$deploymentId" params={{ deploymentId: deployment.id }}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-mono">{deployment.name}</CardTitle>
            <StatusBadge status={deployment.status} />
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div className="flex gap-4">
            <span>{deployment.region}</span>
            <span>{deployment.size}</span>
            <span className="capitalize">{deployment.primary_model}</span>
          </div>
          {deployment.persona_name && (
            <div>Persona: <span className="text-foreground">{deployment.persona_name}</span></div>
          )}
          {deployment.ip_address && (
            <div>IP: <span className="font-mono text-foreground">{deployment.ip_address}</span></div>
          )}
          <div className="text-xs">
            {new Date(deployment.created_at).toLocaleDateString()}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
