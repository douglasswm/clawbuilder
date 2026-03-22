import { useState } from 'react'
import { useOperationSSE } from './useOperationSSE'
import { startSnapshotOperation, startRestoreOperation } from '../api/operations'

export function useSnapshotMutation(deploymentId: string) {
  const [operationId, setOperationId] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const progress = useOperationSSE(operationId, 'snapshot')

  const mutate = async (data: { snapshot_name: string }) => {
    setIsPending(true)
    setMutationError(null)
    try {
      const res = await startSnapshotOperation(deploymentId, data)
      if (res.ok && res.operation_id) {
        setOperationId(res.operation_id)
      } else {
        setMutationError(res.message || 'Failed to start snapshot')
      }
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Failed to start snapshot')
    } finally {
      setIsPending(false)
    }
  }

  const reset = () => {
    setOperationId(null)
    setIsPending(false)
    setMutationError(null)
  }

  return { mutate, isPending, mutationError, progress, reset }
}

export function useRestoreMutation() {
  const [operationId, setOperationId] = useState<string | null>(null)
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const progress = useOperationSSE(operationId, 'restore')

  const mutate = async (data: {
    snapshot_name: string
    region: string
    size: string
    name: string
  }) => {
    setIsPending(true)
    setMutationError(null)
    try {
      const res = await startRestoreOperation(data)
      if (res.ok && res.operation_id) {
        setOperationId(res.operation_id)
        if (res.deploymentId) setDeploymentId(res.deploymentId)
      } else {
        setMutationError(res.message || 'Failed to start restore')
      }
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Failed to start restore')
    } finally {
      setIsPending(false)
    }
  }

  const reset = () => {
    setOperationId(null)
    setDeploymentId(null)
    setIsPending(false)
    setMutationError(null)
  }

  return { mutate, isPending, mutationError, progress, deploymentId, reset }
}
