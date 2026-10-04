import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Appearance } from "@/components/Common/Appearance"
import { LanguageSelect } from "@/components/Common/LanguageSelect"
import { Logo } from "@/components/Common/Logo"
import { Button } from "@/components/ui/button"
import { isLoggedIn } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"

const SECTION_LINKS = [
  { href: "#how", labelKey: "nav.how" },
  { href: "#call", labelKey: "nav.call" },
  { href: "#medications", labelKey: "nav.medications" },
  { href: "#peace", labelKey: "nav.peace" },
] as const

function useHasScrolled(offset = 8): boolean {
  const [hasScrolled, setHasScrolled] = useState(false)

  useEffect(() => {
    const update = () => setHasScrolled(window.scrollY > offset)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [offset])

  return hasScrolled
}

export function LandingHeader() {
  const { t } = useTranslation("landing")
  const hasScrolled = useHasScrolled()
  const loggedIn = isLoggedIn()

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300",
        hasScrolled
          ? "bg-background/70 shadow-[0_1px_0_0_var(--border)] backdrop-blur-xl backdrop-saturate-150"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="#top" className="shrink-0">
          <Logo asLink={false} />
        </a>

        <nav aria-label={t("nav.label")} className="hidden md:block">
          <ul className="flex items-center gap-1">
            {SECTION_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t(link.labelKey)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSelect />
          </div>
          <Appearance />
          {loggedIn ? (
            <Button asChild size="sm">
              <Link to="/">{t("nav.dashboard")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">{t("nav.logIn")}</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link to="/signup">{t("nav.signUp")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
