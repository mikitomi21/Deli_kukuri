import { createFileRoute } from "@tanstack/react-router"

import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "Kukurin Mafia",
      },
    ],
  }),
})

function Dashboard() {
  const { user: currentUser } = useAuth()

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
      <span aria-hidden className="text-7xl">
        🌽
      </span>
      <h1 className="bg-gradient-to-r from-amber-400 via-yellow-500 to-lime-500 bg-clip-text text-6xl font-black tracking-tight text-transparent">
        Kukurin Mafia
      </h1>
      <p className="max-w-md text-lg text-muted-foreground">
        Startowy template React + FastAPI. Edytuj
        <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-sm">
          frontend/src/routes/_layout/index.tsx
        </code>
        i patrz na zmiany na żywo.
      </p>
      {currentUser && (
        <p className="text-sm text-muted-foreground">
          Zalogowany jako{" "}
          <span className="font-medium text-foreground">
            {currentUser.full_name || currentUser.email}
          </span>
        </p>
      )}
    </div>
  )
}
