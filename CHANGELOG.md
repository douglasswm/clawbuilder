# Changelog

All notable changes to this project will be documented in this file.

## [0.2.8.0] - 2026-03-23

### Added
- `retryCliCommand` helper — extracted retry-with-backoff pattern from `executeFunnelSetup` into a reusable, testable function (5 retries, exponential backoff, SSH error detection)
- Post-restore model configuration for both inline `do-restore` and sidecar SSE restore paths — instances now receive the platform's default model after snapshot restore
- `redactArgs` tests covering all sensitive CLI flags (tailscale-auth-key, bot-token, byteplus-ark-api-key)

### Changed
- Fresh deploy `--primary-model` flag now uses `toCliModel()` to translate platform model names to CLI model names (e.g., `byteplus-arkmodel` → `byteplus`)
- Post-restore tasks (model update + funnel setup) are sequenced: model first, then funnel, with funnel always proceeding regardless of model outcome
- `executeFunnelSetup` refactored to use `retryCliCommand` helper (behavior preserved, DRY)

### Fixed
- Snapshot-restored instances never received the platform's configured default model — `update-model` now fires after restore completes
- Sidecar restore path (`updateDeploymentAfterRestore`) blocked HTTP response during model update retries — now fire-and-forget

## [0.2.7.0] - 2026-03-23

### Added
- Telegram bot pairing wizard on deployment detail page — multi-step dialog with BotFather instructions, QR codes, token validation, and pairing code flow
- `telegramSetup` and `telegramPair` server functions with CAS locking and bot token scrubbing
- `telegram_status`, `telegram_bot_username`, and `telegram_error` columns with CHECK constraint
- Bot token format validation via regex and Telegram `getMe` API verification
- `toCliModel` helper for mapping platform model identifiers to CLI model identifiers

### Fixed
- CLI stderr no longer leaked to client in error responses — logged server-side only
- `BYTEPLUS_ARKMODEL_API_KEY` env var now correctly mapped to `BYTEPLUS_ARK_API_KEY` for CLI

## [0.2.6.0] - 2026-03-23

### Added
- Gateway token display with copy button on deployment detail page — users can copy-paste the token into the OpenClaw dashboard instead of relying on broken `auth.html` redirect
- API key removal buttons on Settings page — each saved key now has a "Remove" action
- `attemptAutoFunnel()` helper for running deployments that missed initial funnel setup

### Fixed
- `clearActiveOperation` query was built but never awaited — operation locks were never actually cleared by the frontend
- Tailscale auth key leaked in CLI args via `clawmacdo` wrapper's verbatim argv logging — now redacted
- SSE lock cleared on client disconnect even when sidecar job still running — now only clears on normal stream completion
- `droplet_hostname` not set for fresh platform-managed deploys — snapshot/destroy lookups by name would fail
- Auto-funnel stuck permanently for deployments reaching `running` without IP — poll now continues for pending funnel setup
- `isTailscaleAvailable` returned platform availability for legacy user-managed deployments — now returns `userKeyAvailable` field
- Funnel retry success didn't update `tailscale_setup_status` locally — UI showed stale "failed" state until page reload
- Polling continued indefinitely for running deployments with in-progress funnel setup

## [0.2.5.1] - 2026-03-23

### Fixed
- `clearActiveOperation` now uses compare-and-swap to prevent stale tabs from clearing a newer operation's lock
- Tailscale hostname includes deployment UUID prefix to prevent cross-tenant device collisions
- `executeFunnelSetup` throws if CLI exits 0 but no funnel URL is parsed (prevents zombie configured state)
- Platform-managed funnel re-enable now injects fresh auth key (prevents failure after device session loss)
- Tailscale API calls have 30-second timeout via `AbortSignal.timeout()` (prevents indefinite hangs)
- Migration backfill guarded with `AND tailscale_managed = true` to avoid misleading status on user-managed rows
- Poll dedupe now compares `tailscale_setup_status` and `funnel_url` (fixes stale UI after auto-funnel completes)
- User-managed fresh deploys now pass `--tailscale` flags to CLI when user has a stored auth key
- `.env.example` updated: removed stale `TAILSCALE_AUTH_KEY`, added `PLATFORM_DEFAULT_MODEL` and `BYTEPLUS_ARKMODEL_API_KEY`
- `deleteDevice` no longer sends `Content-Type: application/json` on bodyless DELETE request
- Tailnet and device ID values URI-encoded in Tailscale API URL paths

## [0.2.5.0] - 2026-03-23

### Added
- **Platform-managed Tailscale** — platform auto-generates single-use auth keys via Tailscale REST API so users get a live HTTPS Funnel URL without any Tailscale awareness
- `tailscale-api.ts` module: `isPlatformTailscaleEnabled()`, `createTenantAuthKey()`, `deleteDevice()`, `findDeviceByHostname()` wrapping `api.tailscale.com/api/v2`
- Tailscale setup state machine (`tailscale_setup_status`: pending → in_progress → configured | failed) replacing overloaded `tailscale_configured` boolean for platform-managed deployments
- Auto-funnel triggers in `pollDeploymentStatus()`, `updateDeploymentAfterRestore()`, and sync restore path — all use atomic claim pattern to prevent duplicate setups
- `executeFunnelSetup()` shared helper extracted from `toggleFunnel()` — DRY across manual toggle, auto-funnel in poll, and auto-funnel in restore
- Tailscale device cleanup in `destroyDeployment()` via `deleteDevice()` API call
- Dual-mode `isTailscaleAvailable()` returns `{ available, mode }` for frontend conditional rendering
- Dual-mode `toggleFunnel()` uses platform key (via `createTenantAuthKey()`) or user key based on `tailscale_managed` flag, with retry from `failed` state
- Settings page: platform mode info message + legacy key input for user-managed deployments
- Deployment detail page: state machine Funnel card UI (pending spinner, in_progress progress bar, configured URL display, failed retry button)
- Database migration: `tailscale_device_id`, `tailscale_hostname`, `tailscale_managed`, `tailscale_setup_status` columns on deployments table
- 18 new unit tests (13 for tailscale-api module, 5 for platform mode integration)
- 3 new TODOs: HOME directory unification, API token rotation automation, orphan device cleanup

### Next Steps (manual)
- Create a platform Tailscale account at https://login.tailscale.com/start (Free plan is sufficient)
- Generate an API access token (Settings → Keys, all scopes, 90-day expiry)
- Enable MagicDNS and HTTPS Certificates in Tailscale DNS settings
- Deploy ACL policy from `docs/tailscale-migration.md` Section 3 into Access Controls tab
- Test ACL isolation: deploy 2 dummy `tag:tenant` nodes, verify they can't reach each other
- Set env vars: `TAILSCALE_API_TOKEN` and `TAILSCALE_TAILNET`
- Set a 90-day calendar reminder for API token rotation
- Run database migration: `20260323002000_platform_tailscale.sql`

### Fixed
- Auto-funnel rolls back to `pending` when IP address is not yet available (prevents stuck `in_progress` state)
- `createTenantAuthKey()` failure during deploy now marks deployment as `failed` instead of leaving it in `pending`
- `startRestoreFromSnapshot()` now sets `tailscale_managed` flag so Restore page deployments participate in platform mode
- Fresh deploy path stores `tailscale_hostname` from `--hostname` flag so device discovery works for destroy cleanup

## [0.2.4.0] - 2026-03-22

### Added
- **Snapshot/restore progress tracking via SSE** — real-time progress bars for snapshot and restore operations using `clawmacdo serve` sidecar with Server-Sent Events
- Sidecar lifecycle manager (`clawmacdo-serve.ts`) with PID tracking, health checks, startup mutex, SIGTERM/SIGINT cleanup, and automatic retry
- SSE proxy route (`/api/sse/{operationId}`) with auth gating, UUID validation, and ownership verification
- `useOperationSSE` hook with step parsing, 10-minute absolute timeout, toast notifications, and malformed JSON handling
- `useSnapshotMutation` and `useRestoreMutation` hooks wiring server functions to SSE progress
- `OperationProgressBar` component with step counter, elapsed time, expandable logs, status coloring, and dismiss
- Create Snapshot card on deployment detail page (side-by-side with Tailscale Funnel card on desktop)
- Dedicated `/restore` route for restoring from agent template snapshots with SSE progress
- Auto-generated snapshot names (`{deployment}-snap-YYYYMMDD`)
- Last operation card showing step history from clawmacdo's SQLite
- `active_operation_id` and `last_operation_id` columns on deployments table for SSE reconnect on page reload
- Restore flow creates Supabase deployment row before proxying to sidecar — dashboard sees restored instances immediately

### Fixed
- Deploy wizard now resolves actual snapshot name from `provider_snapshots` JSONB instead of passing template slug (which failed validation)
- `PersonaPicker` passes full template data (`templateId`, `providerSnapshots`) to deploy form
- `getMarketplaceTemplateBySlug` queries `agent_templates` directly to include `provider_snapshots` for deployment
- Race condition in `createSnapshot` — atomic `WHERE active_operation_id IS NULL` claim prevents concurrent snapshots
- Non-zero `clawmacdo track` exits now treated as deployment failures instead of silently swallowed
- Restore snapshot validation scoped to `digitalocean` provider (not any provider in JSONB)
- SSE proxy checks `sidecarRes.ok` before streaming (prevents forwarding error pages as SSE)
- Sidecar PID ownership verified before trusting orphaned process on port
- Deploy page links include required `search` params for TanStack Router validation

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
