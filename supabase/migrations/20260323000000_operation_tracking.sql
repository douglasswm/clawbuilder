-- Add operation tracking columns to deployments
ALTER TABLE public.deployments
  ADD COLUMN active_operation_id TEXT,
  ADD COLUMN last_operation_id TEXT;
