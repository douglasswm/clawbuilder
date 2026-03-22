import { useEffect, useRef, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { createOperationEventSource } from '../api/operations'
import type { OperationProgress, OperationType } from '../types/operations'

const STEP_REGEX = /\[Step (\d+)\/(\d+)\]\s*(.*)/
const SSE_TIMEOUT_MS = 10 * 60_000 // 10 minutes absolute

export function useOperationSSE(
  operationId: string | null,
  type: OperationType
) {
  const esRef = useRef<EventSource | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [progress, setProgress] = useState<OperationProgress>({
    operationId: null,
    type,
    status: 'idle',
    currentStep: 0,
    totalSteps: 0,
    currentLabel: '',
    logs: [],
    error: null,
    result: null,
  })

  const cleanup = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!operationId) return

    cleanup()

    setProgress((prev) => ({
      ...prev,
      operationId,
      status: 'running',
      currentStep: 0,
      totalSteps: 0,
      currentLabel: 'Starting...',
      logs: [],
      error: null,
      result: null,
    }))

    const es = createOperationEventSource(operationId)
    esRef.current = es

    // Absolute timeout — not reset by events
    timeoutRef.current = setTimeout(() => {
      setProgress((prev) => ({
        ...prev,
        status: 'error',
        error: 'Operation timed out — check server logs.',
      }))
      toast.error('Operation timed out', { duration: Infinity })
      cleanup()
    }, SSE_TIMEOUT_MS)

    es.onmessage = (event) => {
      const msg = event.data as string

      // Check for terminal messages
      const completePrefix =
        type === 'snapshot'
          ? 'SNAPSHOT_COMPLETE_JSON:'
          : 'RESTORE_COMPLETE_JSON:'
      const errorPrefix =
        type === 'snapshot' ? 'SNAPSHOT_ERROR:' : 'RESTORE_ERROR:'

      if (msg.startsWith(completePrefix)) {
        let payload: Record<string, unknown> = {}
        try {
          payload = JSON.parse(msg.slice(completePrefix.length))
        } catch {
          // Malformed JSON — still mark as completed
          payload = {}
        }
        setProgress((prev) => ({
          ...prev,
          status: 'completed',
          currentStep: prev.totalSteps,
          currentLabel: 'Complete',
          result: payload,
        }))
        if (type === 'snapshot') {
          const name = (payload.snapshot_name as string) || 'Snapshot'
          toast.success(`${name} created successfully`, { duration: 5000 })
        } else {
          const hostname = (payload.hostname as string) || 'Instance'
          toast.success(`Restore complete — ${hostname} is running`, { duration: 5000 })
        }
        cleanup()
        return
      }

      if (msg.startsWith(errorPrefix)) {
        const errorMsg = msg.slice(errorPrefix.length)
        setProgress((prev) => ({
          ...prev,
          status: 'error',
          error: errorMsg,
        }))
        toast.error(
          type === 'snapshot'
            ? `Snapshot failed: ${errorMsg}`
            : `Restore failed: ${errorMsg}`,
          { duration: Infinity }
        )
        cleanup()
        return
      }

      // Parse step progress
      const stepMatch = msg.match(STEP_REGEX)
      if (stepMatch) {
        const [, current, total, label] = stepMatch
        setProgress((prev) => ({
          ...prev,
          currentStep: parseInt(current, 10),
          totalSteps: parseInt(total, 10),
          currentLabel: label,
          logs: [...prev.logs, msg],
        }))
        return
      }

      // Append as log line
      setProgress((prev) => ({
        ...prev,
        logs: [...prev.logs, msg],
      }))
    }

    es.onerror = () => {
      // SSE errors are normal when the stream ends
      cleanup()
    }

    return cleanup
  }, [operationId, type, cleanup])

  return progress
}
