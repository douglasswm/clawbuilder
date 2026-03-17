# TODOS

## Authentication

### Supabase local emulator for integration tests

**What:** Set up Supabase CLI local dev (`supabase start`) for integration tests that validate real JWT handling, cookie flows, and PKCE code exchange.

**Why:** Current E2E tests use mock sessions via `setSession()` which bypasses JWT validation and real cookie handling. Integration tests with a real Supabase instance catch a class of bugs mocks cannot.

**Effort:** M
**Priority:** P2
**Depends on:** E2E test infrastructure (completed)

### Supabase RLS policies

**What:** Configure row-level security when database tables are added.

**Why:** Without RLS, any authenticated user can read/write all rows via the anon key.

**Context:** No data tables exist yet. When the first table is created, RLS must be enabled and policies written before shipping. The anon key is exposed client-side, so RLS is the primary data access control.

**Effort:** S
**Priority:** P1
**Depends on:** First database table being created

## Infrastructure

### Error monitoring (Sentry)

**What:** Add client-side error tracking for auth failures and unhandled exceptions.

**Why:** Auth errors (expired codes, PKCE mismatches, network failures) currently only log to `console.error` — invisible in production.

**Context:** Supabase auth has multiple error paths (see error handling table in the auth plan). Sentry's TanStack Router integration can capture route-level errors automatically.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Completed

### E2E test infrastructure for auth flow

**What:** Add Vitest + Playwright and test the full auth flow (sign-in, callback, auth guard, sign-out, multi-tab sync).

**Completed:** feat/google-oauth-auth (2026-03-17)
