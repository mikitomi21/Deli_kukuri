import { Link } from "@tanstack/react-router"
import {
  ArrowDown,
  ArrowRight,
  CircleCheck,
  Database,
  Phone,
  PhoneCall,
  Smartphone,
} from "lucide-react"
import type { CSSProperties } from "react"
import { useTranslation } from "react-i18next"

import { AppScreenshot } from "@/components/Landing/AppScreenshot"
import { BrowserFrame } from "@/components/Landing/BrowserFrame"
import { Reveal } from "@/components/Landing/Reveal"
import { Button } from "@/components/ui/button"
import { useScrollProgress } from "@/hooks/useScrollProgress"

const tiltStyle = {
  transform:
    "perspective(1800px) rotateX(calc((1 - var(--scroll-progress, 1)) * 16deg)) scale(calc(0.92 + var(--scroll-progress, 1) * 0.08))",
  transformOrigin: "center top",
} satisfies CSSProperties

const floatStyle = {
  transform: "translateY(calc((1 - var(--scroll-progress, 1)) * 48px))",
} satisfies CSSProperties

export function HeroSection() {
  const { t } = useTranslation("landing")
  const stageRef = useScrollProgress<HTMLDivElement>({
    startAt: 1,
    endAt: 0.15,
  })

  const trustItems = [
    { icon: Phone, label: t("hero.trust.anyPhone") },
    { icon: Smartphone, label: t("hero.trust.noApp") },
    { icon: Database, label: t("hero.trust.openFda") },
  ]

  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative isolate pt-16 pb-16 sm:pt-24 sm:pb-24"
    >
      <div
        aria-hidden="true"
        className="landing-grid absolute inset-x-0 top-0 -z-10 h-[720px]"
      />
      <div
        aria-hidden="true"
        className="landing-glow absolute top-[-280px] left-1/2 -z-10 h-[720px] w-[1100px] -translate-x-1/2"
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3.5 py-1.5 text-sm font-medium text-primary ring-1 ring-primary/25 backdrop-blur">
              <PhoneCall aria-hidden="true" className="size-4" />
              {t("hero.eyebrow")}
            </p>
          </Reveal>

          <Reveal delayMs={80}>
            <h1
              id="hero-title"
              className="mt-8 text-5xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-7xl"
            >
              <span className="block">{t("hero.titleLine1")}</span>
              <span className="block text-primary">{t("hero.titleLine2")}</span>
            </h1>
          </Reveal>

          <Reveal delayMs={160}>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
              {t("hero.lead")}
            </p>
          </Reveal>

          <Reveal delayMs={240}>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-7 text-base">
                <Link to="/signup">
                  {t("hero.primaryCta")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="h-12 px-6 text-base"
              >
                <a href="#how">
                  {t("hero.secondaryCta")}
                  <ArrowDown aria-hidden="true" />
                </a>
              </Button>
            </div>
          </Reveal>

          <Reveal delayMs={320}>
            <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
              {trustItems.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  <item.icon
                    aria-hidden="true"
                    className="size-4 text-primary"
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <div
          ref={stageRef}
          className="relative mx-auto mt-16 max-w-5xl sm:mt-20"
        >
          <div style={tiltStyle} className="will-change-transform">
            <BrowserFrame address={t("hero.address")}>
              <AppScreenshot
                name="dashboard"
                alt={t("hero.screenshotAlt")}
                eager
                className="w-full rounded-none shadow-none ring-0"
              />
            </BrowserFrame>
          </div>

          <div
            style={floatStyle}
            className="relative mx-auto -mt-6 w-[min(92%,340px)] sm:absolute sm:-bottom-10 sm:-left-10 sm:mx-0 sm:mt-0 lg:-left-16"
          >
            <IncomingCallCard />
          </div>

          <div
            style={floatStyle}
            className="absolute -right-2 bottom-24 hidden sm:block lg:-right-12"
          >
            <TakenCard />
          </div>
        </div>
      </div>
    </section>
  )
}

function IncomingCallCard() {
  const { t } = useTranslation("landing")

  return (
    <div className="rounded-2xl bg-background/80 p-4 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.5)] ring-1 ring-foreground/10 backdrop-blur-xl backdrop-saturate-150">
      <div className="flex items-center gap-3">
        <span className="relative flex size-11 shrink-0 items-center justify-center">
          <span
            aria-hidden="true"
            className="landing-ring absolute inset-0 rounded-full bg-primary/40"
          />
          <span className="relative flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <PhoneCall aria-hidden="true" className="size-5" />
          </span>
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            {t("hero.incomingLabel")}
          </p>
          <p className="font-semibold">{t("hero.incomingCaller")}</p>
        </div>
      </div>
      <p className="mt-3 rounded-xl bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
        {t("hero.incomingText")}
      </p>
    </div>
  )
}

function TakenCard() {
  const { t } = useTranslation("landing")

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-background/80 py-3 pr-5 pl-3 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.5)] ring-1 ring-foreground/10 backdrop-blur-xl backdrop-saturate-150">
      <span className="flex size-9 items-center justify-center rounded-full bg-success/15 text-success">
        <CircleCheck aria-hidden="true" className="size-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-success">
          {t("hero.acceptedLabel")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("hero.acceptedText")}
        </p>
      </div>
    </div>
  )
}
