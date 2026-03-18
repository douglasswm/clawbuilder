import { Badge } from '@workspace/ui/components/badge';
import { cn } from '@workspace/ui/lib/utils';

type DeploymentStatus = 'pending' | 'provisioning' | 'running' | 'destroying' | 'destroyed' | 'failed';

const STATUS_CONFIG: Record<DeploymentStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-700 hover:bg-gray-100' },
  provisioning: { label: 'Provisioning', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  running: { label: 'Running', className: 'bg-green-100 text-green-700 hover:bg-green-100' },
  destroying: { label: 'Destroying', className: 'bg-orange-100 text-orange-700 hover:bg-orange-100' },
  destroyed: { label: 'Destroyed', className: 'bg-gray-100 text-gray-500 hover:bg-gray-100' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
};

interface StatusBadgeProps {
  status: DeploymentStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-700 hover:bg-gray-100' };
  return (
    <Badge className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
