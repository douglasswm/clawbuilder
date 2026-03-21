-- Track whether Tailscale has been installed and connected on the droplet
ALTER TABLE public.deployments
  ADD COLUMN tailscale_configured BOOLEAN NOT NULL DEFAULT false;
