import { createBrowserClient } from "@supabase/ssr"

let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl) {
      throw new Error(
        "Missing VITE_SUPABASE_URL environment variable. " +
          "Copy apps/web/.env.example to apps/web/.env.local and fill in your Supabase project URL.",
      )
    }

    if (!supabaseAnonKey) {
      throw new Error(
        "Missing VITE_SUPABASE_ANON_KEY environment variable. " +
          "Copy apps/web/.env.example to apps/web/.env.local and fill in your Supabase anon key.",
      )
    }

    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  }
  return browserClient
}
