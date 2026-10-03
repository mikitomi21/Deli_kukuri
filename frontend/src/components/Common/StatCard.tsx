import type { LucideIcon } from "lucide-react"
import { TrendingDown, TrendingUp } from "lucide-react"
import type { ReactNode } from "react"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type StatCardProps = {
  icon: LucideIcon
  /** Soft tint behind the icon: primary (default), success, destructive, muted. */
  tone?: "primary" | "success" | "destructive" | "muted"
  label: string
  value: ReactNode
  /** Optional change chip, e.g. "+18%" — paired with an arrow, never color-only. */
  delta?: { value: string; up: boolean }
  /** Muted comparison text next to the delta chip, e.g. "vs last week". */
  comparison?: string
}

const toneClasses = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
} as const

// Card-level accent: tinted border + value in the tone color so the tile
// reads at a glance (green = done, red = attention, gray = neutral).
const cardAccentClasses = {
  primary: "border-primary/30",
  success: "border-success/40",
  destructive: "border-destructive/40",
  muted: "",
} as const

const valueClasses = {
  primary: "text-primary",
  success: "text-success",
  destructive: "text-destructive",
  muted: "",
} as const

/** Stat card in the ShadcnSpace style: tinted icon chip, big tabular value, small label. */
export function StatCard({
  icon: Icon,
  tone = "primary",
  label,
  value,
  delta,
  comparison,
}: StatCardProps) {
  return (
    <Card className={cardAccentClasses[tone]}>
      <CardHeader className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            toneClasses[tone],
          )}
        >
          <Icon aria-hidden className="size-4.5" />
        </div>
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums",
            valueClasses[tone],
          )}
        >
          {value}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        {delta && (
          <span className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                delta.up
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {delta.up ? (
                <TrendingUp aria-hidden className="size-3" />
              ) : (
                <TrendingDown aria-hidden className="size-3" />
              )}
              {delta.value}
            </span>
            {comparison && (
              <span className="text-muted-foreground">{comparison}</span>
            )}
          </span>
        )}
      </CardContent>
    </Card>
  )
}
