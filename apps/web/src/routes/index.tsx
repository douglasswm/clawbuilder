import { Link, createFileRoute } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Brain,
  ChatCircle,
  Lightning,
  Plugs,
  Robot,
  Sparkle,
} from "@phosphor-icons/react"

export const Route = createFileRoute("/")({
  component: LandingPage,
})

const features = [
  {
    icon: Robot,
    title: "Build Agents",
    description: "Create AI agents tailored to your specific workflows and tasks.",
  },
  {
    icon: Lightning,
    title: "Automate Work",
    description: "Let agents handle repetitive tasks so you can focus on what matters.",
  },
  {
    icon: ChatCircle,
    title: "Natural Language",
    description: "Configure agents using plain English — no coding required.",
  },
  {
    icon: Brain,
    title: "Smart Memory",
    description: "Agents learn and remember context across conversations.",
  },
  {
    icon: Plugs,
    title: "Integrations",
    description: "Connect to your favorite tools and services seamlessly.",
  },
  {
    icon: Sparkle,
    title: "Always Improving",
    description: "Agents get smarter over time as they learn from interactions.",
  },
]

function LandingPage() {
  return (
    <div className="min-h-svh bg-[#f5f0eb]">
      {/* Navbar */}
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-lg font-semibold">ClawBuilder</span>
        <div className="flex items-center gap-3">
          <Link to="/login" search={{ redirect: undefined }}>
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link to="/login" search={{ redirect: undefined }}>
            <Button size="sm">Get Started</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center px-6 pt-24 pb-20 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Create agents that actually do work for you
        </h1>
        <p className="mt-4 max-w-lg text-lg text-muted-foreground">
          Build, deploy, and manage AI agents that automate your workflows. No complexity, just results.
        </p>
        <Link to="/login" search={{ redirect: undefined }} className="mt-8">
          <Button size="lg">Get Started — It&apos;s Free</Button>
        </Link>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="mb-8 text-center text-2xl font-semibold">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="bg-white/60 backdrop-blur-sm">
              <CardHeader>
                <Icon className="mb-2 h-8 w-8 text-primary" weight="duotone" />
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
