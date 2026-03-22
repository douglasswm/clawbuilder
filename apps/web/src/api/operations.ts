import { createSnapshot, startRestoreFromSnapshot } from '../lib/server/deployments'

export async function startSnapshotOperation(
  deploymentId: string,
  data: { snapshot_name: string }
): Promise<{ ok: boolean; message: string; operation_id?: string }> {
  return createSnapshot({ data: { deploymentId, snapshotName: data.snapshot_name } })
}

export async function startRestoreOperation(
  data: { snapshot_name: string; region: string; size: string; name: string }
): Promise<{ ok: boolean; message: string; operation_id?: string; deploymentId?: string }> {
  return startRestoreFromSnapshot({
    data: {
      snapshotName: data.snapshot_name,
      region: data.region,
      size: data.size,
      name: data.name,
    },
  })
}

export function createOperationEventSource(operationId: string): EventSource {
  return new EventSource(`/api/sse/${operationId}`)
}
