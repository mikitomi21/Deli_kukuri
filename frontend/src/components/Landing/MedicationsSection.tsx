import {
  Database,
  FileCheck2,
  Info,
  type LucideIcon,
  Sparkles,
} from "lucide-react"
import type { CSSProperties } from "react"
import { useTranslation } from "react-i18next"

import { AppScreenshot } from "@/components/Landing/AppScreenshot"
import { Reveal } from "@/components/Landing/Reveal"
import { SectionHeading } from "@/components/Landing/SectionHeading"
import { useScrollProgress } from "@/hooks/useScrollProgress"
import { cn } from "@/lib/utils"

const backLayerStyle = {
  transform:
    "translateY(calc((1 - var(--scroll-progress, 1)) * -24px)) scale(calc(0.9 + var(--scroll-progress, 1) * 0.02))",
} satisfies CSSProperties

const frontLayerStyle = {
  transform: "translateY(calc((1 - var(--scroll-progress, 1)) * 72px))",
} satisfies CSSProperties

interface PipelineNode {
  key: "source" | "ai" | "summary"
  icon: LucideIcon
}

const PIPELINE: readonly PipelineNode[] = [
  { key: "source", icon: Database },
  { key: "ai", icon: Sparkles },
  { key: "summary", icon: FileCheck2 },
]

export function MedicationsSection() {
  const { t } = useTranslation("landing")
  const stackRef = useScrollProgress<HTMLDivElement>({
    startAt: 0.95,
    endAt: 0.35,
  })

  return (
    <section
      id="medications"
      aria-labelledby="medications-title"
      className="scroll-mt-16 border-y bg-muted/30 py-28 sm:py-36"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          id="medications-title"
          eyebrow={t("medications.eyebrow")}
          title={t("medications.title")}
          lead={t("medications.lead")}
          align="center"
        />

        <Reveal className="mt-16">
          <ol
            aria-label={t("medications.pipeline.label")}
            className="mx-auto flex max-w-3xl flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-0"
          >
            {PIPELINE.map((node, index) => (
              <li
                key={node.key}
                className="flex flex-1 items-center sm:contents"
              >
                <div className="flex flex-1 items-center gap-3 rounded-2xl bg-background p-4 ring-1 ring-foreground/5 sm:flex-col sm:text-center">
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      node.key === "ai"
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    <node.icon aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">
                      {t(`medications.pipeline.${node.key}.title`)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t(`medications.pipeline.${node.key}.text`)}
                    </p>
                  </div>
                </div>
                {index < PIPELINE.length - 1 && <FlowConnector />}
              </li>
            ))}
          </ol>
        </Reveal>

        <div ref={stackRef} className="relative mx-auto mt-20 max-w-5xl">
          <div style={backLayerStyle} className="origin-top opacity-70">
            <AppScreenshot
              name="med-fda"
              alt={t("medications.fdaAlt")}
              className="w-full"
            />
          </div>
          <div style={frontLayerStyle} className="relative -mt-[22%] px-[4%]">
            <AppScreenshot
              name="med-ai"
              alt={t("medications.aiAlt")}
              className="w-full shadow-[0_40px_100px_-30px_rgb(0_0_0/0.5)] ring-primary/30"
            />
          </div>
        </div>

        <div className="mx-auto mt-24 grid max-w-5xl items-center gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Reveal>
            <p className="text-2xl leading-snug font-semibold tracking-[-0.02em] text-balance sm:text-3xl">
              {t("medications.listCaption")}
            </p>
            <p className="mt-6 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t("medications.disclaimer")}
            </p>
          </Reveal>
          <Reveal delayMs={120}>
            <AppScreenshot
              name="ward-meds"
              alt={t("medications.listAlt")}
              className="w-full"
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function FlowConnector() {
  return (
    <div
      aria-hidden="true"
      className="relative hidden h-px w-16 shrink-0 bg-border sm:block"
    >
      <span className="landing-flow-dot absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
    </div>
  )
}
