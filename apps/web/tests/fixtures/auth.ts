/**
 * Auth test fixtures and Playwright helpers.
 *
 * ## Two test modes
 *
 * ### Unauthenticated tests
 * SSR `beforeLoad` in __root.tsx returns `session: null` when no cookies are
 * present. The route guards in _authenticated.tsx throw a redirect immediately
 * on the server side. Playwright sees the redirect happen before the page
 * finishes loading — no mock injection needed.
 *
 * ### Authenticated tests
 * SSR still returns `session: null` (no real Supabase cookies). After page
 * load, `mockAuthenticatedSession(page)` calls `supabase.auth.setSession()`
 * via `page.evaluate()` (using `window.__test_supabase__` exposed in DEV mode),
 * then calls `router.invalidate()` to re-trigger all `beforeLoad` guards on
 * the client side. The guards see the now-populated session and allow access.
 */

import type { Page } from "@playwright/test"

export const mockUser = {
  id: "test-user-id-123",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.com",
  email_confirmed_at: "2024-01-01T00:00:00Z",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  user_metadata: {
    full_name: "Test User",
    avatar_url: null,
    email: "test@example.com",
  },
  app_metadata: {
    provider: "google",
    providers: ["google"],
  },
}

export const mockSession = {
  access_token: "mock-access-token-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  refresh_token: "mock-refresh-token",
  token_type: "bearer",
  // expires_at MUST be in the future — if the token appears expired, Supabase
  // SDK will attempt a background refresh, hit the real API, fail, fire
  // SIGNED_OUT, and redirect mid-test.
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  user: mockUser,
}

/**
 * Injects a mock Supabase session into the browser page and re-triggers all
 * route guards so the app behaves as if the user is authenticated.
 *
 * Prerequisites: `window.__test_supabase__` and `window.__test_router__` must
 * be set (done in `__root.tsx` when `import.meta.env.DEV === true`).
 */
export async function mockAuthenticatedSession(page: Page): Promise<void> {
  // Safety net: intercept token refresh calls and return the mock session.
  // This prevents surprise SIGNED_OUT events if Supabase decides to refresh
  // in the background (belt-and-suspenders alongside the future expires_at).
  await page.route("**/auth/v1/token?grant_type=refresh_token*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSession),
    })
  })

  // Navigate to root so the app boots and window.__test_supabase__ is set.
  await page.goto("/")
  await page.waitForLoadState("networkidle")

  // Inject the mock session via the public Supabase API.
  const result = await page.evaluate(
    async ({ accessToken, refreshToken }) => {
      const win = window as Window & {
        __test_supabase__?: { auth: { setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<{ error: Error | null }> } }
        __test_router__?: { invalidate: () => Promise<void> }
      }
      if (!win.__test_supabase__) {
        throw new Error("window.__test_supabase__ not set — is the app running in DEV mode?")
      }
      const { error } = await win.__test_supabase__.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      return { error: error ? error.message : null }
    },
    { accessToken: mockSession.access_token, refreshToken: mockSession.refresh_token },
  )

  if (result.error) {
    throw new Error(`setSession failed: ${result.error}`)
  }

  // Re-trigger all beforeLoad guards so the router sees the new session.
  await page.evaluate(async () => {
    const win = window as Window & {
      __test_router__?: { invalidate: () => Promise<void> }
    }
    if (!win.__test_router__) {
      throw new Error("window.__test_router__ not set — is the app running in DEV mode?")
    }
    await win.__test_router__.invalidate()
  })

  await page.waitForLoadState("networkidle")
}

/**
 * Signs out the current session and clears cookies.
 */
export async function clearAuthSession(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const win = window as Window & {
      __test_supabase__?: { auth: { signOut: () => Promise<void> } }
    }
    if (win.__test_supabase__) {
      await win.__test_supabase__.auth.signOut()
    }
  })
  await page.context().clearCookies()
}
