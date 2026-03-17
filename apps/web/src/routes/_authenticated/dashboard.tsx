import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { Plus } from "@phosphor-icons/react"

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
})

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function DashboardPage() {
  const { user } = useRouteContext({ from: "/_authenticated/dashboard" })
  const fullName = (user?.user_metadata?.full_name as string) || "there"
  const firstName = fullName.split(" ")[0]

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="flex max-w-lg flex-col items-center gap-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {getGreeting()}, {firstName}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Create your first agent to get started.
          </p>
        </div>

        <button className="flex h-48 w-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
          <Plus className="h-8 w-8" />
          <span className="text-sm font-medium">New Agent</span>
        </button>
      </div>
    </div>
  )
}
