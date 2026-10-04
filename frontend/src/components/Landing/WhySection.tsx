import { Ear, KeyRound, Phone } from "lucide-react"
import type { CSSProperties } from "react"
import { useTranslation } from "react-i18next"

import { Reveal } from "@/components/Landing/Reveal"
import { useScrollProgress } from "@/hooks/useScrollProgress"

function wordStyle(index: number, total: number): CSSProperties {
  const position = (index / total) * 0.9
  return {
    opacity: `clamp(0.18, calc((var(--scroll-progress, 1) - ${position.toFixed(4)}) * 12 + 0.18), 1)`,
  }
}

export function WhySection() {
  const { t } = useTranslation("landing")
  const statementRef = useScrollProgress<HTMLParagraphElement>({
    startAt: 0.85,
    endAt: 0.3,
  })
  const words = t("why.statement").split(" ")

  const points = [
    {
      icon: Phone,
      title: t("why.points.phone.title"),
      text: t("why.points.phone.text"),
    },
    {
      icon: KeyRound,
      title: t("why.points.noSetup.title"),
      text: t("why.points.noSetup.text"),
    },
    {
      icon: Ear,
      title: t("why.points.voice.title"),
      text: t("why.points.voice.text"),
    },
  ]

  return (
    <section
      aria-labelledby="why-title"
      className="mx-auto max-w-6xl px-4 py-28 sm:px-6 sm:py-36"
    >
      <h2
        id="why-title"
        className="text-sm font-semibold tracking-wide text-primary"
      >
        {t("why.eyebrow")}
      </h2>
      <p
        ref={statementRef}
        className="mt-6 max-w-5xl text-3xl leading-[1.18] font-semibold tracking-[-0.025em] text-balance sm:text-5xl"
      >
        {words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            style={wordStyle(index, words.length)}
            className="transition-opacity duration-150"
          >
            {word}{" "}
          </span>
        ))}
      </p>

      <ul className="mt-20 grid gap-4 sm:grid-cols-3">
        {points.map((point, index) => (
          <li key={point.title}>
            <Reveal
              delayMs={index * 90}
              className="h-full rounded-2xl bg-muted/50 p-7 ring-1 ring-foreground/5"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <point.icon aria-hidden="true" className="size-5" />
              </span>
              <h3 className="mt-6 text-lg font-semibold tracking-tight">
                {point.title}
              </h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                {point.text}
              </p>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  )
}
