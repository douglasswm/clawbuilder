-- Platform-managed Tailscale: add columns for device lifecycle, hostname tracking,
-- platform vs user-managed flag, and setup state machine.
ALTER TABLE public.deployments
  ADD COLUMN tailscale_device_id TEXT,
  ADD COLUMN tailscale_hostname TEXT,
  ADD COLUMN tailscale_managed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN tailscale_setup_status TEXT NOT NULL DEFAULT 'pending';

-- Backfill: only platform-managed deployments with tailscale_configured=true get 'configured' status
UPDATE public.deployments
  SET tailscale_setup_status = 'configured'
  WHERE tailscale_configured = true
    AND tailscale_managed = true;
