# Changelog

All notable changes to this project will be documented in this file.

## [0.2.3.0] - 2026-03-22

### Added
- Public marketplace browse page (`/marketplace`) with category filter, search, and template card grid
- Template detail page (`/marketplace/$slug`) with provider badges and deploy CTA
- Multi-cloud provider support: `provider_snapshots` JSONB column replaces `snapshot_name` on `agent_templates`
- Provider selector in deploy wizard with URL param pre-fill (`/deploy?template=<slug>&provider=<provider>`)
- `marketplace_templates` Postgres VIEW for public read access without exposing sensitive columns
- Deploy count trigger: auto-increments on `agent_templates` when deployment reaches `running` status
- `listMarketplaceTemplates` and `getMarketplaceTemplateBySlug` public server functions (no auth required)
- `useTemplateList` reusable hook extracted from PersonaPicker (DRY refactor)
- Provider validation: `PROVIDERS`, `SUPPORTED_PROVIDERS`, `PROVIDER_LABELS`, `validateProvider()`
- `template_id` foreign key on `deployments` table linking deploys to source templates
- 8 new seed templates (10 total): Customer Support, Sales Outreach, Content Writer, Code Review, Data Analyst, Meeting Scheduler, Research Agent, Email Assistant
- Partial index on `agent_templates (is_active, is_published)` for marketplace query performance

### Changed
- `agent_templates` schema: added `slug`, `category`, `provider_snapshots`, `display_metadata`, `is_published`, `deploy_count`; dropped `snapshot_name`
- `createDeployment` accepts `templateId` and `provider` params for template-based deploys
- PersonaPicker uses `slug` instead of `snapshot_name` for template identification
- RLS policies: marketplace VIEW is publicly readable; base table requires authentication
- Deploy wizard supports URL search params for marketplace deep linking
- Provider selector gated to `SUPPORTED_PROVIDERS` (currently DigitalOcean only) with "Coming Soon" for unsupported providers

### Fixed
- Hardcoded `'digitalocean'` provider in deployment INSERT now uses user-selected provider
- Snapshot validation updated to use `provider_snapshots` JSONB after `snapshot_name` column drop
- Search wildcards (`%`, `_`) escaped in marketplace ilike queries

## [0.2.2.0] - 2026-03-22

### Added
- Per-user Tailscale auth keys stored encrypted in `user_api_keys` table (AES-256-GCM)
- Tailscale Auth Key input field on Settings page with masked display
- `isTailscaleAvailable` server function checking user key OR platform key
- Server-side snapshot validation against `agent_templates` before restore
- System architecture documentation (`docs/architecture.md`)
- Unit tests for Tailscale key in `buildCliBaseEnv`, `checkTailscaleAvailable`, and `hasAnyApiKey`

### Changed
- Tailscale Funnel uses per-user encrypted key with platform `TAILSCALE_AUTH_KEY` as fallback
- Simplified deployment detail Funnel UI: removed user-provided auth key input form
- Funnel card always shows "Turn Off" when funnel is active, regardless of key availability
- `DO_TOKEN` passed via environment variable instead of CLI argument (prevents log leakage)

### Fixed
- Tailscale Funnel "No deploy records found" error by switching to environment-based auth
- `hasAnyApiKey` missing `tailscale_key_encrypted` column check
- `pollDeploymentStatus` silently ignoring non-zero CLI exit codes
- `persona_pushed` not reflected in poll response after successful push

## [0.2.1.0] - 2026-03-18

### Added
- Platform-level default AI provider via `PLATFORM_DEFAULT_MODEL` and `BYTEPLUS_ARKMODEL_API_KEY` env vars
- `byteplus-arkmodel` model type in validation constants and label maps
- Migration to make `primary_model` column nullable for graceful degradation

### Changed
- Renamed `buildDoTokenEnv` to `buildCliBaseEnv` with BytePlus API key passthrough
- Deployment card and detail page use `MODEL_LABELS` lookup instead of CSS capitalize
- Platform model stored in DB and passed as `--primary-model` to CLI when set

### Fixed
- Model display shows correct label ("ArkModel (BytePlus)") instead of raw "byteplus-arkmodel"

## [0.2.0.0] - 2026-03-18

### Added
- Deploy wizard with persona selection, name generation, and advanced settings (region, size, model)
- Deployment detail page with real-time status polling, progress tracking, and destroy functionality
- Settings page for managing encrypted AI API keys (Anthropic, OpenAI, Gemini)
- Skills catalog proxy with category browsing, search, and 5-minute caching
- AES-256-GCM credential encryption for API key storage
- CLI wrapper for clawmacdo with isolated sandboxes and 30s timeout
- Supabase migration for deployments and user_api_keys tables with RLS policies
- Dashboard deployment list with status badges and deployment cards
- Validation module for deployment names, regions, sizes, and models
- Unit tests for all server modules (132 tests)

### Changed
- Dashboard now shows deployment list instead of placeholder
- Authenticated layout includes toast notifications via sonner

### Fixed
- Server modules use dynamic imports to prevent node:crypto leaking into client bundle
- Explicit CLI environment construction prevents server secret leakage to subprocesses
- Sandbox directories cleaned up on deployment failure and timeout
- Graceful decrypt error handling prevents 500 errors from corrupted keys
- Polling cleanup guards prevent state updates on unmounted components
- Error states shown in dashboard and settings instead of silent failures

## [0.1.0.0] - 2026-03-17

### Added
- Initial project setup with TanStack Start, Supabase Auth, and Google OAuth
- Authenticated layout with sidebar navigation
