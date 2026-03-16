/**
 * Validates a redirect path to prevent open redirect attacks.
 * Only allows relative paths starting with `/`.
 * Returns `/dashboard` for any invalid or absolute URL.
 */
export function validateRedirect(path: string | undefined | null): string {
  if (!path) return "/dashboard"
  if (!path.startsWith("/")) return "/dashboard"
  if (path.startsWith("//")) return "/dashboard"
  if (path.includes("://")) return "/dashboard"
  return path
}
