import { test, expect } from "@playwright/test"
import { mockSession, mockUser, mockAuthenticatedSession, clearAuthSession } from "../fixtures/auth"

test.describe("Login page", () => {
  test("renders welcome heading and Google sign-in button", async ({ page }) => {
    await page.goto("/login")
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible()
  })
})

test.describe("Auth callback", () => {
  test("valid PKCE code redirects to /dashboard", async ({ page }) => {
    // Intercept the code exchange (PKCE) and user fetch
    await page.route("**/auth/v1/token*", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockSession),
        })
      } else {
        await route.continue()
      }
    })
    await page.route("**/auth/v1/user", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUser),
      })
    })

    await page.goto("/auth/callback?code=mock-code")
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 })
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test("invalid code redirects to /login", async ({ page }) => {
    await page.route("**/auth/v1/token*", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid code" }),
        })
      } else {
        await route.continue()
      }
    })

    await page.goto("/auth/callback?code=bad-code")
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test("no code and no session redirects to /login", async ({ page }) => {
    await page.goto("/auth/callback")
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe("Sign-out", () => {
  test.afterEach(async ({ page }) => {
    await clearAuthSession(page)
  })

  test("clicking sign out redirects away from /dashboard", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    // Open the user profile dropdown and click sign out
    await page.getByRole("button").filter({ hasText: /Test User|TU/i }).click()
    await page.getByRole("menuitem", { name: /Sign out/i }).click()

    await page.waitForURL(/\/login/, { timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe("Cross-tab sync", () => {
  test("sign-out in one tab triggers redirect in another tab", async ({ browser }) => {
    const context = await browser.newContext()
    const page1 = await context.newPage()
    const page2 = await context.newPage()

    try {
      // Set up authenticated session in page1
      await mockAuthenticatedSession(page1)
      await page1.goto("/dashboard")
      await page1.waitForLoadState("networkidle")

      // Navigate page2 to /dashboard (guarded route — will redirect to /login after sign-out)
      await page2.goto("/dashboard")
      await page2.waitForLoadState("networkidle")

      // Trigger sign-out via Supabase client in page1 (fires BroadcastChannel/localStorage event)
      await page1.evaluate(async () => {
        const win = window as Window & {
          __test_supabase__?: { auth: { signOut: () => Promise<void> } }
        }
        if (win.__test_supabase__) {
          await win.__test_supabase__.auth.signOut()
        }
      })

      // page2 should detect the SIGNED_OUT event via onAuthStateChange and invalidate router
      await page2.waitForURL(/\/login/, { timeout: 15_000 })
      await expect(page2).toHaveURL(/\/login/)
    } finally {
      await page1.close()
      await page2.close()
      await context.close()
    }
  })
})
