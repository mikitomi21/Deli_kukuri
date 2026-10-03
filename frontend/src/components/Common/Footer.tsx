import { useTranslation } from "react-i18next"

export function Footer() {
  const currentYear = new Date().getFullYear()
  const { t } = useTranslation("auth")

  return (
    <footer className="border-t py-4 px-6">
      <p className="text-muted-foreground text-center text-sm">
        {t("footer.copyright", { year: currentYear })}
      </p>
    </footer>
  )
}
