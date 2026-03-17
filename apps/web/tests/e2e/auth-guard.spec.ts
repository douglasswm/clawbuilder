import { test, expect } from "@playwright/test"
import { mockAuthenticatedSession, clearAuthSession } from "../fixtures/auth"

test.describe("Auth guard — unauthenticated", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
  })

  test("visiting /dashboard redirects to /login with redirect param", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/login/)
    const url = new URL(page.url())
    expect(url.searchParams.get("redirect")).toBe("/dashboard")
  })

  test("visiting / stays on landing page", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL("/")
    await expect(page.getByRole("heading", { name: /Create agents/i })).toBeVisible()
  })
})

test.describe("Auth guard — authenticated", () => {
  test.afterEach(async ({ page }) => {
    await clearAuthSession(page)
  })

  test("visiting /login redirects to /dashboard", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await page.goto("/login")
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 })
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test("visiting /dashboard renders sidebar nav items", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("link", { name: "Chat" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Activity" })).toBeVisible()
  })
})
