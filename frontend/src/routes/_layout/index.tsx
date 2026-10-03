import { createFileRoute, Link } from "@tanstack/react-router"
import { UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "DzwoniLek",
      },
    ],
  }),
})

function Dashboard() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
      <span aria-hidden className="text-7xl">
        💊
      </span>
      <h1 className="bg-gradient-to-r from-amber-400 via-yellow-500 to-lime-500 bg-clip-text text-6xl font-black tracking-tight text-transparent">
        DzwoniLek
      </h1>
      <p className="max-w-md text-lg text-muted-foreground">
        System sam dzwoni do Twoich podopiecznych o porach leków i zapisuje, co
        odpowiedzieli. Zacznij od dodania pierwszego podopiecznego.
      </p>
      <Button asChild size="lg" data-testid="add-ward-cta">
        <Link to="/wards/new">
          <UserPlus className="mr-2" />
          Dodaj podopiecznego
        </Link>
      </Button>
    </div>
  )
}
