import { describe, it, expect } from "vitest"
import { validateRedirect } from "../../src/lib/auth-utils"

describe("validateRedirect", () => {
  it("returns /dashboard for null", () => {
    expect(validateRedirect(null)).toBe("/dashboard")
  })

  it("returns /dashboard for undefined", () => {
    expect(validateRedirect(undefined)).toBe("/dashboard")
  })

  it("returns /dashboard for empty string", () => {
    expect(validateRedirect("")).toBe("/dashboard")
  })

  it("returns /dashboard for absolute URL", () => {
    expect(validateRedirect("https://evil.com")).toBe("/dashboard")
  })

  it("returns /dashboard for protocol-relative URL", () => {
    expect(validateRedirect("//evil.com")).toBe("/dashboard")
  })

  it("returns /dashboard for embedded protocol", () => {
    expect(validateRedirect("/foo://bar")).toBe("/dashboard")
  })

  it("returns /dashboard for path missing leading slash", () => {
    expect(validateRedirect("relative/path")).toBe("/dashboard")
  })

  it("returns valid path as-is", () => {
    expect(validateRedirect("/settings")).toBe("/settings")
  })

  it("returns nested valid path as-is", () => {
    expect(validateRedirect("/dashboard/agents/123")).toBe("/dashboard/agents/123")
  })

  it("returns URL-encoded path as-is", () => {
    expect(validateRedirect("/dash%20board")).toBe("/dash%20board")
  })
})
