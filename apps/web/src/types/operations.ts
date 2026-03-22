export type OperationType = 'snapshot' | 'restore'
export type OperationStatus = 'idle' | 'pending' | 'running' | 'completed' | 'error'

export interface OperationProgress {
  operationId: string | null
  type: OperationType
  status: OperationStatus
  currentStep: number
  totalSteps: number
  currentLabel: string
  logs: string[]
  error: string | null
  result: Record<string, unknown> | null
}
