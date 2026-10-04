import {
  CalendarCheck,
  CalendarClock,
  type LucideIcon,
  PhoneCall,
  Pill,
  UserPlus,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  AppScreenshot,
  type ScreenshotName,
} from "@/components/Landing/AppScreenshot"
import { SectionHeading } from "@/components/Landing/SectionHeading"
import { cn } from "@/lib/utils"

interface Step {
  key: "ward" | "routine" | "schedule" | "call" | "result"
  icon: LucideIcon
  shots: readonly ScreenshotName[]
  compact: boolean
}

const STEPS: readonly Step[] = [
  { key: "ward", icon: UserPlus, shots: ["add-ward"], compact: true },
  { key: "routine", icon: Pill, shots: ["add-routine"], compact: true },
  {
    key: "schedule",
    icon: CalendarClock,
    shots: ["routines", "upcoming"],
    compact: false,
  },
  { key: "call", icon: PhoneCall, shots: ["call-turns"], compact: false },
  { key: "result", icon: CalendarCheck, shots: ["calendar"], compact: false },
]

function useActiveStep(stepCount: number) {
  const stepRefs = useRef<(HTMLLIElement | null)[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = stepRefs.current.indexOf(entry.target as HTMLLIElement)
          if (index >= 0) setActiveIndex(index)
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    )

    for (const element of stepRefs.current.slice(0, stepCount)) {
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [stepCount])

  return { stepRefs, activeIndex }
}

interface StepShotsProps {
  step: Step
  alt: string
  bleed?: boolean
}

function StepShots({ step, alt, bleed = false }: StepShotsProps) {
  const shouldBleed = bleed && !step.compact

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-4",
        shouldBleed ? "items-start" : "items-center",
      )}
    >
      {step.shots.map((shot, index) => (
        <AppScreenshot
          key={shot}
          name={shot}
          alt={index === 0 ? alt : ""}
          className={cn(
            step.compact && "w-full max-w-[24rem]",
            !step.compact && !shouldBleed && "w-full",
            shouldBleed && "w-[54rem] max-w-none",
          )}
        />
      ))}
    </div>
  )
}

export function HowItWorksSection() {
  const { t } = useTranslation("landing")
  const { stepRefs, activeIndex } = useActiveStep(STEPS.length)
  const progress = (activeIndex + 1) / STEPS.length

  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="scroll-mt-16 border-y bg-muted/30 py-28 sm:py-36"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          id="how-title"
          eyebrow={t("how.eyebrow")}
          title={t("how.title")}
          lead={t("how.lead")}
        />

        <div className="mt-16 grid gap-12 lg:mt-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute top-0 bottom-0 left-[21px] hidden w-0.5 rounded-full bg-border lg:block"
            >
              <div
                className="w-full origin-top bg-primary transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ height: "100%", transform: `scaleY(${progress})` }}
              />
            </div>

            <ol className="space-y-16 lg:space-y-0">
              {STEPS.map((step, index) => {
                const isActive = index === activeIndex
                return (
                  <li
                    key={step.key}
                    ref={(element) => {
                      stepRefs.current[index] = element
                    }}
                    aria-current={isActive ? "step" : undefined}
                    className="lg:flex lg:min-h-[72vh] lg:items-center lg:first:min-h-[56vh] lg:last:min-h-[56vh]"
                  >
                    <div
                      className={cn(
                        "relative flex gap-5 transition-opacity duration-500",
                        isActive ? "lg:opacity-100" : "lg:opacity-35",
                      )}
                    >
                      <span
                        className={cn(
                          "relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full ring-1 transition-colors duration-500",
                          isActive
                            ? "bg-primary text-primary-foreground ring-primary"
                            : "bg-background text-primary ring-border",
                        )}
                      >
                        <step.icon aria-hidden="true" className="size-5" />
                      </span>
                      <div className="min-w-0 space-y-3 pt-1">
                        <p className="text-sm font-medium text-muted-foreground tabular-nums">
                          {t("how.stepLabel", { number: index + 1 })}
                        </p>
                        <h3 className="text-2xl leading-tight font-semibold tracking-[-0.02em] sm:text-3xl">
                          {t(`how.steps.${step.key}.title`)}
                        </h3>
                        <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
                          {t(`how.steps.${step.key}.text`)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-8 rounded-3xl bg-background p-5 ring-1 ring-foreground/5 lg:hidden">
                      <StepShots
                        step={step}
                        alt={t(`how.steps.${step.key}.alt`)}
                      />
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="hidden lg:block">
            <div className="sticky top-24 flex h-[calc(100vh-8rem)] items-center">
              <div className="relative aspect-[5/4] w-full overflow-hidden rounded-[2rem] bg-background ring-1 ring-foreground/5">
                <div
                  aria-hidden="true"
                  className="landing-glow absolute inset-x-0 -top-1/3 h-full opacity-60"
                />
                {STEPS.map((step, index) => {
                  const isActive = index === activeIndex
                  return (
                    <div
                      key={step.key}
                      aria-hidden={!isActive}
                      className={cn(
                        "absolute inset-0 flex items-center transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity",
                        step.compact
                          ? "justify-center p-10"
                          : "py-10 pl-10 [mask-image:linear-gradient(to_right,black_78%,transparent)]",
                        isActive
                          ? "scale-100 opacity-100"
                          : "pointer-events-none opacity-0 motion-safe:scale-[0.96]",
                      )}
                    >
                      <StepShots
                        step={step}
                        alt={t(`how.steps.${step.key}.alt`)}
                        bleed
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
