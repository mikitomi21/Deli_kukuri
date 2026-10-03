import { useQuery } from "@tanstack/react-query"
import { Link, useMatches } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { Fragment } from "react"
import { useTranslation } from "react-i18next"

import { fetchWard } from "@/hooks/useWards"

type Crumb = {
  pathname: string
  label: string
}

function crumbLabel(
  pathname: string,
  wardName: string | undefined,
  t: (key: string) => string,
): string | null {
  if (pathname === "/") return t("breadcrumbs.dashboard")
  if (pathname === "/admin") return t("breadcrumbs.admin")
  if (pathname === "/settings") return t("breadcrumbs.settings")
  if (/^\/wards\/[^/]+\/calls\/[^/]+$/.test(pathname))
    return t("breadcrumbs.call")
  if (/^\/wards\/[^/]+$/.test(pathname)) {
    // Prefer the ward's name once loaded; fall back to a generic label.
    return wardName || t("breadcrumbs.ward")
  }
  return null
}

/** Build the trail: root first, then one entry per matched route. */
export function Breadcrumbs() {
  const { t } = useTranslation("routes")
  const matches = useMatches()

  // Reuse the ward detail query so the crumb upgrades to the ward's name
  // as soon as it is (or was) loaded.
  const wardMatch = matches.find((m) => /^\/wards\/[^/]+$/.test(m.pathname))
  const wardId = (wardMatch?.params as { wardId?: string } | undefined)?.wardId
  const { data: ward } = useQuery({
    queryKey: ["ward", wardId],
    queryFn: () => fetchWard(wardId as string),
    enabled: !!wardId,
    staleTime: Infinity,
  })

  const crumbs: Crumb[] = []
  for (const match of matches) {
    if (match.id === "__root__") continue
    if (crumbs.some((c) => c.pathname === match.pathname)) continue
    const label = crumbLabel(match.pathname, ward?.full_name, t)
    if (label === null) continue
    crumbs.push({ pathname: match.pathname, label })
  }

  if (crumbs.length === 0) return null

  return (
    <nav aria-label={t("breadcrumbs.dashboard")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <Fragment key={crumb.pathname}>
              {index > 0 && (
                <ChevronRight
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              )}
              <li
                className={
                  isLast
                    ? "truncate font-medium text-foreground"
                    : "truncate text-muted-foreground"
                }
                aria-current={isLast ? "page" : undefined}
              >
                {isLast ? (
                  crumb.label
                ) : (
                  <Link to={crumb.pathname} className="hover:text-foreground">
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
