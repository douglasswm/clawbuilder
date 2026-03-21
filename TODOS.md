# TODOS

## Authentication

### Supabase local emulator for integration tests

**What:** Set up Supabase CLI local dev (`supabase start`) for integration tests that validate real JWT handling, cookie flows, and PKCE code exchange.

**Why:** Current E2E tests use mock sessions via `setSession()` which bypasses JWT validation and real cookie handling. Integration tests with a real Supabase instance catch a class of bugs mocks cannot.

**Effort:** M
**Priority:** P2
**Depends on:** E2E test infrastructure (completed)

### ~~Supabase RLS policies~~ ✅ Completed

**What:** Configure row-level security when database tables are added.

**Completed:** feat/clawmacdo-deploy (2026-03-18) — RLS enabled on `deployments` and `user_api_keys` tables with user-scoped policies.

## Infrastructure

### Error monitoring (Sentry)

**What:** Add client-side error tracking for auth failures and unhandled exceptions.

**Why:** Auth errors (expired codes, PKCE mismatches, network failures) currently only log to `console.error` — invisible in production.

**Context:** Supabase auth has multiple error paths (see error handling table in the auth plan). Sentry's TanStack Router integration can capture route-level errors automatically.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Deployments

### Replace polling with Supabase Realtime

**What:** Replace `setInterval` polling on the deployment detail page with a Supabase Realtime subscription on the `deployments` table.

**Why:** Eliminates unnecessary CLI spawns on every poll interval; updates are instant instead of waiting up to 10 seconds.

**Effort:** M/c
**Priority:** P2
**Depends on:** Polling implementation (feat/clawmacdo-deploy)

### Server-side rate limiting for deployment polling

**What:** Add per-user rate limiting to the `pollDeploymentStatus` server function (minimum 5s between polls per deployment).

**Why:** Each poll spawns a CLI subprocess. Without rate limiting, concurrent browser tabs or direct API calls can overwhelm the server with child processes.

**Context:** Current 10s client-side interval is fine for single-user. When the app goes multi-tenant, server-side enforcement becomes necessary. Implementation options: in-memory `Map<deploymentId, lastPollTimestamp>` or Supabase-based tracking.

**Effort:** S
**Priority:** P3
**Depends on:** Polling implementation (feat/clawmacdo-deploy)

### Tailscale Funnel sandbox state fix

**What:** Ensure CLI sandbox always has valid deploy records for Tailscale Funnel commands.

**Why:** If the `TAILSCALE_AUTH_KEY` env var alone doesn't resolve the "No deploy records found" CLI error, the sandbox directory needs minimal deploy state written before funnel commands.

**Context:** The web app sets `HOME` to `/tmp/clawmacdo-<uuid>` for CLI isolation. For snapshot-restored deployments or older rows with `sandbox_dir = null`, the sandbox may lack deploy records. Approach B would write minimal state files before calling `tailscale-funnel`, `funnel-on`, or `funnel-off`.

**Effort:** M
**Priority:** P2
**Depends on:** Tailscale Funnel env var fix shipping + testing

### Dashboard pagination

**What:** Add cursor-based pagination for the deployments list on the dashboard.

**Why:** Prevents slow loads when a user accumulates many deployments.

**Effort:** S
**Priority:** P3
**Depends on:** Dashboard deployment list (feat/clawmacdo-deploy)

### E2E tests for deploy wizard and management

**What:** Playwright E2E tests covering the full wizard flow (configure → review → deploy), polling on the detail page, and the destroy confirmation dialog.

**Why:** Unit tests miss UI integration issues; E2E catches the full request/response cycle.

**Effort:** M
**Priority:** P2
**Depends on:** feat/clawmacdo-deploy shipping

### Multi-instance deployments

**What:** Support 1–10 instances per deployment (split tables, extra wizard step, batched polling).

**Why:** Power-user feature for running agent fleets from a single deployment config.

**Effort:** L
**Priority:** P3
**Depends on:** V1 single-instance deployment (feat/clawmacdo-deploy)

## Marketplace

### Rate limiting on public marketplace endpoint

**What:** Add basic rate limiting to the public `listMarketplaceTemplates()` server function to prevent abuse from bots/scrapers.

**Why:** The marketplace is the first public (no-auth) endpoint in ClawBuilder. Without rate limiting, a scraper could hammer the Supabase DB. Same pattern as the existing deployment polling rate limiting TODO.

**Effort:** S
**Priority:** P3
**Depends on:** Marketplace feature (feat/template-marketplace)

### AWS Lightsail and BytePlus CLI support in clawmacdo

**What:** Add `do-restore` equivalents for AWS Lightsail and BytePlus in `clawmacdo` CLI so users can deploy templates to those providers.

**Why:** The marketplace shows provider badges and the deploy wizard has a provider selector, but only DigitalOcean actually works. AWS/BytePlus deploy commands must exist in clawmacdo before users can deploy to those providers. The UI currently links to `/deploy?provider=aws-lightsail` but the CLI will fail.

**Effort:** L
**Priority:** P1
**Depends on:** clawmacdo CLI (external dependency, read-only)

### Provider-first deploy flow (US-002)

**What:** Add an alternative deploy flow where the user selects a cloud provider first, then sees templates available for that provider.

**Why:** User story US-002 describes a provider-first flow. The current marketplace implements template-first (US-003 only). Some users will want to choose their provider before browsing templates.

**Effort:** M
**Priority:** P2
**Depends on:** Marketplace feature (feat/template-marketplace)

### Per-agent Stripe billing integration (US-001)

**What:** Integrate Stripe-backed per-agent billing that gates deployment. Each live deployment is billed as a paid agent.

**Why:** User stories US-001, US-002, US-003, and US-006 all reference per-agent billing. Currently deployments are free. Billing must be in place before commercial launch.

**Context:** Stripe billing activation should be required before deployment actions are unlocked. Users without active billing can browse the marketplace but not deploy.

**Effort:** XL
**Priority:** P1
**Depends on:** Marketplace feature, Stripe Connect setup

### Golden copy template designation

**What:** Mark one template as the "default golden copy" baseline OpenClaw instance (US-002). Add an `is_golden_copy` boolean or a "default" category to distinguish it in the marketplace and deploy flow.

**Why:** US-002 describes a golden copy default deploy option. Currently all templates are equal — there's no way to identify the baseline.

**Effort:** S
**Priority:** P2
**Depends on:** Marketplace feature (feat/template-marketplace)

### Composite index on agent_templates for marketplace queries

**What:** Add `CREATE INDEX idx_agent_templates_marketplace ON agent_templates (is_active, is_published) WHERE is_active = true AND is_published = true`.

**Why:** The marketplace VIEW filters on these two booleans on every page load. Index costs nothing and prevents a performance cliff as template count grows. Public page may be hit by crawlers.

**Effort:** S
**Priority:** P3
**Depends on:** Marketplace feature (feat/template-marketplace)

## Completed

### E2E test infrastructure for auth flow

**What:** Add Vitest + Playwright and test the full auth flow (sign-in, callback, auth guard, sign-out, multi-tab sync).

**Completed:** feat/google-oauth-auth (2026-03-17)
