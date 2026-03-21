-- Add Tailscale Funnel columns to deployments
ALTER TABLE public.deployments
  ADD COLUMN funnel_url TEXT,
  ADD COLUMN gateway_token TEXT;
