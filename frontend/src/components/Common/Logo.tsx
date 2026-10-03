import { Link } from "@tanstack/react-router"
import { Sprout } from "lucide-react"
import { useTranslation } from "react-i18next"

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
  const { t } = useTranslation("common")
  const content = (
    <span className={cn("flex items-center gap-2 font-extrabold", className)}>
      {variant !== "full" && (
        <Sprout aria-hidden="true" className="size-5 shrink-0" />
      )}
      {variant !== "icon" && (
        <span className="text-primary group-data-[collapsible=icon]:hidden">
          {t("logo.brand")}
        </span>
      )}
    </span>
  )

  if (!asLink) {
    return content
  }

  return <Link to="/">{content}</Link>
}
