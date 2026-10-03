import { Link } from "@tanstack/react-router"

import { cn } from "@/lib/utils"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

export function Logo({
  variant = "full",
  className,
  asLink = true,
}: LogoProps) {
  const content = (
    <span className={cn("flex items-center gap-2 font-extrabold", className)}>
      {variant !== "full" && (
        <span aria-hidden className="text-xl">
          🌽
        </span>
      )}
      {variant !== "icon" && (
        <span className="bg-gradient-to-r from-amber-400 via-yellow-500 to-lime-500 bg-clip-text text-transparent group-data-[collapsible=icon]:hidden">
          Kukurin Mafia
        </span>
      )}
    </span>
  )

  if (!asLink) {
    return content
  }

  return <Link to="/">{content}</Link>
}
