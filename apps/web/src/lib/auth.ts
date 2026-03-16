import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { getSupabaseServerClient } from "./supabase.server"

export const getServerSession = createServerFn().handler(async () => {
  const request = getRequest()
  const { supabase } = getSupabaseServerClient(request)
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return {
    session,
    user: session?.user ?? null,
  }
})
