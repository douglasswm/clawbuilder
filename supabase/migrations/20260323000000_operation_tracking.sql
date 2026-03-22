-- Add operation tracking columns to deployments
ALTER TABLE public.deployments
  ADD COLUMN IF NOT EXISTS active_operation_id TEXT,
  ADD COLUMN IF NOT EXISTS last_operation_id TEXT;
