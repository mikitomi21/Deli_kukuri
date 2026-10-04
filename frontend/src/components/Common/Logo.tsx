import { Link } from "@tanstack/react-router"
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
// headers): pill mascot + wordmark. The icon-only variant keeps a
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
      <img
        src="/logo.png"
        alt={variant === "icon" ? t("logo.brand") : ""}
        width={256}
        height={256}
        draggable={false}
        className={cn(
          "shrink-0 select-none object-contain",
          size === "lg" ? "size-14" : "size-9",
        )}
      />
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
