import {
  BellRing,
  CalendarRange,
  MessageSquareText,
  PhoneCall,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { AppScreenshot } from "@/components/Landing/AppScreenshot"
import { Reveal } from "@/components/Landing/Reveal"
import { SectionHeading } from "@/components/Landing/SectionHeading"
import { useInView } from "@/hooks/useInView"
import { cn } from "@/lib/utils"

export function PeaceSection() {
  const { t } = useTranslation("landing")

  const points = [
    {
      icon: CalendarRange,
      title: t("peace.points.history.title"),
      text: t("peace.points.history.text"),
    },
    {
      icon: PhoneCall,
      title: t("peace.points.calls.title"),
      text: t("peace.points.calls.text"),
    },
    {
      icon: BellRing,
      title: t("peace.points.alerts.title"),
      text: t("peace.points.alerts.text"),
    },
  ]

  return (
    <section
      id="peace"
      aria-labelledby="peace-title"
      className="scroll-mt-16 py-28 sm:py-36"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          id="peace-title"
          eyebrow={t("peace.eyebrow")}
          title={t("peace.title")}
          lead={t("peace.lead")}
        />

        <CalendarWithNotification />

        <div className="mt-20 grid items-center gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ul className="space-y-8">
            {points.map((point, index) => (
              <li key={point.title}>
                <Reveal delayMs={index * 90} className="flex gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <point.icon aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">
                      {point.title}
                    </h3>
                    <p className="mt-1 leading-relaxed text-muted-foreground">
                      {point.text}
                    </p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
          <Reveal delayMs={120}>
            <AppScreenshot
              name="calls"
              alt={t("peace.callsAlt")}
              className="w-full"
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function CalendarWithNotification() {
  const { t } = useTranslation("landing")
  const [ref, isInView] = useInView<HTMLDivElement>({ threshold: 0.5 })

  return (
    <div ref={ref} className="relative mt-16 pt-16 sm:pt-0">
      <Reveal>
        <div className="overflow-x-auto rounded-xl">
          <AppScreenshot
            name="calendar"
            alt={t("peace.calendarAlt")}
            className="w-full min-w-[640px]"
          />
        </div>
      </Reveal>

      <div
        role="status"
        className={cn(
          "absolute top-0 right-0 w-[min(100%,360px)] rounded-2xl bg-background/80 p-4 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.5)] ring-1 ring-foreground/10 backdrop-blur-xl backdrop-saturate-150 transition-[opacity,transform] delay-500 duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity sm:-top-10 sm:right-6",
          isInView
            ? "translate-y-0 opacity-100"
            : "opacity-0 motion-safe:-translate-y-4",
        )}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <MessageSquareText aria-hidden="true" className="size-3.5" />
          </span>
          <span className="font-medium text-foreground">
            {t("peace.sms.label")}
          </span>
          <span className="ml-auto">{t("peace.sms.time")}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed">{t("peace.sms.text")}</p>
      </div>
    </div>
  )
}
