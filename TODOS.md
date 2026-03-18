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

**Effort:** M
**Priority:** P2
**Depends on:** Polling implementation (feat/clawmacdo-deploy)

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

## Completed

### E2E test infrastructure for auth flow

**What:** Add Vitest + Playwright and test the full auth flow (sign-in, callback, auth guard, sign-out, multi-tab sync).

**Completed:** feat/google-oauth-auth (2026-03-17)
