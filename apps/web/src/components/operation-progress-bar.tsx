'use client'

import { useEffect, useState } from 'react'
import { Progress } from '@workspace/ui/components/progress'
import type { OperationProgress } from '../types/operations'

interface OperationProgressBarProps {
  progress: OperationProgress
  startedAt: number | null
  onClose?: () => void
}

function formatElapsed(startedAt: number): string {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000)
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

export function OperationProgressBar({
  progress,
  startedAt,
  onClose,
}: OperationProgressBarProps) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    if (!startedAt || progress.status !== 'running') {
      return
    }

    setElapsed(formatElapsed(startedAt))

    const interval = setInterval(() => {
      setElapsed(formatElapsed(startedAt))
    }, 1000)

    return () => clearInterval(interval)
  }, [startedAt, progress.status])

  if (progress.status === 'idle') {
    return null
  }

  const percentage = Math.min(
    100,
    Math.max(
      0,
      progress.totalSteps > 0
        ? Math.round((progress.currentStep / progress.totalSteps) * 100)
        : 0
    )
  )

  const isCompleted = progress.status === 'completed'
  const isError = progress.status === 'error'
  const showDismiss = (isCompleted || isError) && onClose

  const indicatorColor = isCompleted
    ? '[&>div]:bg-green-600'
    : isError
      ? '[&>div]:bg-red-600'
      : ''

  return (
    <div className="rounded-lg border bg-muted p-4 space-y-3">
      {/* Header: label + dismiss */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {progress.currentLabel || 'Processing...'}
        </span>
        {showDismiss && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        )}
      </div>

      {/* Progress bar */}
      <Progress value={percentage} className={`h-2 ${indicatorColor}`} />

      {/* Step counter + percentage + elapsed time */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Step {progress.currentStep}/{progress.totalSteps}
        </span>
        <span>
          {percentage}%{elapsed && ` \u00b7 ${elapsed}`}
        </span>
      </div>

      {/* Error banner */}
      {isError && progress.error && (
        <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800">
          {progress.error}
        </div>
      )}

      {/* Expandable logs */}
      {progress.logs.length > 0 && (
        <details>
          <summary className="text-sm text-muted-foreground cursor-pointer select-none">
            Show logs ({progress.logs.length} {progress.logs.length === 1 ? 'line' : 'lines'})
          </summary>
          <div className="mt-2 max-h-48 overflow-y-auto rounded-md border bg-background p-3">
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
              {progress.logs.join('\n')}
            </pre>
          </div>
        </details>
      )}
    </div>
  )
}
