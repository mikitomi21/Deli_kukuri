import {
  CircleCheck,
  FileText,
  MessageSquareText,
  PhoneCall,
  RotateCcw,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Reveal } from "@/components/Landing/Reveal"
import { SectionHeading } from "@/components/Landing/SectionHeading"
import { Badge } from "@/components/ui/badge"
import { useInView } from "@/hooks/useInView"
import { cn } from "@/lib/utils"

type Speaker = "assistant" | "ward"

const CONVERSATION: readonly { key: string; speaker: Speaker }[] = [
  { key: "greeting", speaker: "assistant" },
  { key: "askFirst", speaker: "assistant" },
  { key: "answerFirst", speaker: "ward" },
  { key: "askSecond", speaker: "assistant" },
  { key: "answerSecond", speaker: "ward" },
  { key: "goodbye", speaker: "assistant" },
]

const LINE_INTERVAL_MS = 700
const WAVE_BARS = 28

function useCallTimer(isRunning: boolean): string {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!isRunning) return
    const interval = window.setInterval(
      () => setSeconds((value) => value + 1),
      1000,
    )
    return () => window.clearInterval(interval)
  }, [isRunning])

  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
}

export function CallSection() {
  const { t } = useTranslation("landing")

  const points = [
    { icon: RotateCcw, text: t("call.points.retry") },
    { icon: FileText, text: t("call.points.transcript") },
    { icon: MessageSquareText, text: t("call.points.sms") },
  ]

  return (
    <section
      id="call"
      aria-labelledby="call-title"
      className="scroll-mt-16 py-28 sm:py-36"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <SectionHeading
            id="call-title"
            eyebrow={t("call.eyebrow")}
            title={t("call.title")}
            lead={t("call.lead")}
          />
          <ul className="mt-10 space-y-4">
            {points.map((point, index) => (
              <li key={point.text}>
                <Reveal delayMs={index * 90} className="flex items-start gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <point.icon aria-hidden="true" className="size-4" />
                  </span>
                  <p className="pt-1.5 leading-relaxed">{point.text}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>

        <PhoneCallMock />
      </div>
    </section>
  )
}

function PhoneCallMock() {
  const { t } = useTranslation("landing")
  const [ref, isInView] = useInView<HTMLDivElement>({ threshold: 0.35 })
  const timer = useCallTimer(isInView)
  const resultsDelay = CONVERSATION.length * LINE_INTERVAL_MS + 300

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-md">
      <div
        aria-hidden="true"
        className="landing-glow absolute -inset-16 -z-10 opacity-80"
      />
      <div className="rounded-[2.25rem] bg-card p-3 shadow-[0_50px_120px_-40px_rgb(0_0_0/0.5)] ring-1 ring-foreground/10">
        <div className="rounded-[1.75rem] bg-muted/40 p-5 ring-1 ring-foreground/5">
          <div className="flex items-center gap-3">
            <span className="relative flex size-12 shrink-0 items-center justify-center">
              {isInView && (
                <span
                  aria-hidden="true"
                  className="landing-ring absolute inset-0 rounded-full bg-primary/35"
                />
              )}
              <span className="relative flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <PhoneCall aria-hidden="true" className="size-5" />
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t("call.phone.caller")}</p>
              <p className="text-sm text-muted-foreground">
                {t("call.phone.status")}
              </p>
            </div>
            <time className="font-mono text-sm text-muted-foreground tabular-nums">
              {timer}
            </time>
          </div>

          <div
            role="img"
            aria-label={t("call.phone.listening")}
            className="mt-5 flex h-10 items-center justify-center gap-[3px]"
          >
            {Array.from({ length: WAVE_BARS }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "w-[3px] rounded-full bg-primary/70",
                  isInView && "landing-wave-bar",
                )}
                style={{
                  height: `${30 + ((index * 37) % 70)}%`,
                  animationDelay: `${(index % 7) * 110}ms`,
                }}
              />
            ))}
          </div>

          <ol
            aria-label={t("call.phone.transcriptLabel")}
            className="mt-5 space-y-2.5"
          >
            {CONVERSATION.map((line, index) => {
              const isAssistant = line.speaker === "assistant"
              return (
                <li
                  key={line.key}
                  style={{ transitionDelay: `${index * LINE_INTERVAL_MS}ms` }}
                  className={cn(
                    "flex transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity",
                    isAssistant ? "justify-start" : "justify-end",
                    isInView
                      ? "translate-y-0 opacity-100"
                      : "opacity-0 motion-safe:translate-y-3",
                  )}
                >
                  <p
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      isAssistant
                        ? "rounded-bl-md bg-background ring-1 ring-foreground/5"
                        : "rounded-br-md bg-primary text-primary-foreground",
                    )}
                  >
                    <span className="sr-only">
                      {isAssistant
                        ? t("call.phone.assistant")
                        : t("call.phone.ward")}
                      :{" "}
                    </span>
                    {t(`call.lines.${line.key}`)}
                  </p>
                </li>
              )
            })}
          </ol>
        </div>

        <div
          style={{ transitionDelay: `${resultsDelay}ms` }}
          className={cn(
            "mt-3 rounded-[1.75rem] p-5 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity",
            isInView
              ? "translate-y-0 opacity-100"
              : "opacity-0 motion-safe:translate-y-3",
          )}
        >
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            {t("call.results.label")}
          </p>
          <ul className="mt-3 space-y-2">
            <ResultRow name={t("call.results.first")} confidence={94} />
            <ResultRow name={t("call.results.second")} confidence={98} />
          </ul>
        </div>
      </div>
    </div>
  )
}

function ResultRow({ name, confidence }: { name: string; confidence: number }) {
  const { t } = useTranslation("landing")

  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="font-medium">{name}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("call.results.confidence", { value: confidence })}
        </span>
        <Badge variant="success">
          <CircleCheck aria-hidden="true" />
          {t("call.results.taken")}
        </Badge>
      </span>
    </li>
  )
}
