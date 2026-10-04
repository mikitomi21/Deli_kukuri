import { Link } from "@tanstack/react-router"
import { PhoneCall } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  size?: "sm" | "lg"
  className?: string
  asLink?: boolean
  to?: "/" | "/welcome"
}

// Single brand lockup used across the app (sidebar, auth pages, tab-adjacent
// headers): phone handset chip + wordmark. The icon-only variant keeps a
// square aspect so it fits the collapsed sidebar; text collapses away via
// the sidebar group-data selector in the responsive variant.
export function Logo({
  variant = "full",
  size = "sm",
  className,
  asLink = true,
  to = "/",
}: LogoProps) {
  const { t } = useTranslation("common")
  const content = (
    <span className={cn("flex items-center gap-2 font-extrabold", className)}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
          size === "lg" ? "size-11 rounded-xl" : "size-9",
        )}
      >
        <PhoneCall
          aria-hidden="true"
          className={size === "lg" ? "size-5" : "size-4"}
        />
      </span>
      {variant !== "icon" && (
        <span
          className={cn(
            "text-primary tracking-tight group-data-[collapsible=icon]:hidden",
            size === "lg" ? "text-2xl" : "text-lg",
          )}
        >
          {t("logo.brand")}
        </span>
      )}
    </span>
  )

  if (!asLink) {
    return content
  }

  return (
    <Link
      to={to}
      className="rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {content}
    </Link>
  )
}
