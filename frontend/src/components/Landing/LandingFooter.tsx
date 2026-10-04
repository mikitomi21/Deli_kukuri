import { useTranslation } from "react-i18next"

import { LanguageSelect } from "@/components/Common/LanguageSelect"
import { Logo } from "@/components/Common/Logo"

export function LandingFooter() {
  const { t } = useTranslation("landing")
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
        <div className="space-y-2">
          <Logo asLink={false} />
          <p className="text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <div className="flex items-center gap-4 sm:ml-auto">
          <LanguageSelect />
          <p className="text-sm text-muted-foreground">
            {t("footer.copyright", { year: currentYear })}
          </p>
        </div>
      </div>
    </footer>
  )
}
