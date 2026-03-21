-- Store the actual DigitalOcean droplet hostname (e.g. openclaw-9ba625bb)
ALTER TABLE public.deployments
  ADD COLUMN droplet_hostname TEXT;
