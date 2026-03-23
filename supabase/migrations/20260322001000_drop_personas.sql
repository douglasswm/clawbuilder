-- Drop orphaned personas table (replaced by agent_templates)
DROP POLICY IF EXISTS "Authenticated users can read personas" ON public.personas;
DROP TRIGGER IF EXISTS personas_updated_at ON public.personas;
DROP TABLE IF EXISTS public.personas;
