import {
  CircleCheck,
  CircleHelp,
  CircleX,
  type LucideIcon,
  PhoneCall,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { CallTurn } from "@/types/dashboard"

type ParsedAnswer = NonNullable<CallTurn["parsed"]>

const answerMeta: Record<
  ParsedAnswer,
  {
    icon: LucideIcon
    labelKey: string
    variant: "success" | "destructive" | "outline"
  }
> = {
  yes: { icon: CircleCheck, labelKey: "answerYes", variant: "success" },
  no: { icon: CircleX, labelKey: "answerNo", variant: "destructive" },
  unclear: { icon: CircleHelp, labelKey: "answerUnclear", variant: "outline" },
}

const BUBBLE_STAGGER_MS = 90

function bubbleAnimation(index: number) {
  return {
    className:
      "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:fill-mode-both",
    style: { animationDelay: `${index * BUBBLE_STAGGER_MS}ms` },
  }
}

export function CallConversation({ turns }: { turns: CallTurn[] }) {
  const { t } = useTranslation("wards")

  return (
    <ol
      aria-label={t("callDetail.turnsTitle")}
      className="space-y-5 rounded-2xl bg-muted/40 p-4 ring-1 ring-foreground/5 sm:p-5"
    >
      {turns.map((turn, index) => (
        <li key={turn.turn_no} className="space-y-2.5">
          <p className="text-center text-xs text-muted-foreground tabular-nums">
            {t("callDetail.turnNo", { number: turn.turn_no })}
          </p>
          <AssistantBubble
            question={turn.question}
            animationIndex={index * 2}
          />
          <WardBubble turn={turn} animationIndex={index * 2 + 1} />
        </li>
      ))}
    </ol>
  )
}

function AssistantBubble({
  question,
  animationIndex,
}: {
  question: string
  animationIndex: number
}) {
  const { t } = useTranslation("wards")
  const animation = bubbleAnimation(animationIndex)

  return (
    <div
      style={animation.style}
      className={cn("flex items-end gap-2", animation.className)}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <PhoneCall aria-hidden className="size-3.5" />
      </span>
      <p className="max-w-[80%] rounded-2xl rounded-bl-md bg-background px-4 py-2.5 text-sm leading-relaxed shadow-xs ring-1 ring-foreground/5">
        <span className="sr-only">{t("callDetail.systemLabel")} </span>
        {question}
      </p>
    </div>
  )
}

function WardBubble({
  turn,
  animationIndex,
}: {
  turn: CallTurn
  animationIndex: number
}) {
  const { t } = useTranslation("wards")
  const animation = bubbleAnimation(animationIndex)
  const answer = answerMeta[turn.parsed ?? "unclear"]
  const hasSpeech = turn.speech_result.trim().length > 0

  return (
    <div
      style={animation.style}
      className={cn("flex flex-col items-end gap-1.5", animation.className)}
    >
      <p
        className={cn(
          "max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed",
          hasSpeech
            ? "bg-primary text-primary-foreground"
            : "bg-background italic text-muted-foreground ring-1 ring-foreground/10",
        )}
      >
        <span className="sr-only">{t("callDetail.wardLabel")} </span>
        {hasSpeech ? turn.speech_result : t("callDetail.noAnswer")}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("callDetail.confidenceShort", {
            pct: (turn.confidence * 100).toFixed(0),
          })}
        </span>
        <Badge variant={answer.variant}>
          <answer.icon aria-hidden />
          <span className="sr-only">{t("callDetail.interpretedLabel")} </span>
          {t(`callDetail.${answer.labelKey}`)}
        </Badge>
      </div>
    </div>
  )
}
