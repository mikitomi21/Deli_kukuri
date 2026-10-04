import { CalendarClock, PhoneCall, UserPlus } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Logo } from "@/components/Common/Logo"

// Brand panel shown next to auth forms (login, signup, recovery).
// Static content only: icon chips + type hierarchy, no animation,
// so it stays calm and respects prefers-reduced-motion by default.
export function AuthBrandPanel() {
  const { t } = useTranslation("auth")

  const steps = [
    {
      icon: UserPlus,
      title: t("brandPanel.step1Title"),
      text: t("brandPanel.step1Text"),
    },
    {
      icon: CalendarClock,
      title: t("brandPanel.step2Title"),
      text: t("brandPanel.step2Text"),
    },
    {
      icon: PhoneCall,
      title: t("brandPanel.step3Title"),
      text: t("brandPanel.step3Text"),
    },
  ]

  return (
    <div className="w-full max-w-md space-y-8 px-8 py-12">
      <Logo variant="full" size="lg" to="/welcome" />

      <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
        {t("brandPanel.title")}
      </h2>

      <ol className="space-y-5">
        {steps.map((step) => (
          <li key={step.title} className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-foreground/10">
              <step.icon aria-hidden="true" className="size-4" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
