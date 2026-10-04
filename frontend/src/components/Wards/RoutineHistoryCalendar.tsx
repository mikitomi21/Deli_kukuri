import { useQuery } from "@tanstack/react-query"
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Clock,
  Minus,
  PhoneOff,
  X,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchCalls } from "@/hooks/useCalls"
import { fetchWard } from "@/hooks/useWards"
import i18n from "@/i18n"
import { cn } from "@/lib/utils"
import {
  buildRoutineHistory,
  type HistoryCellStatus,
} from "@/lib/routineHistory"

// Presentation only — labels come from the wards namespace (outcome.* /
// wardDetail.historyNoCall), same split as RoutineStatusBadge. The tinted
// background is the main signal: within one day each routine reads on its
// own (morning taken = green, evening missed = red), not just whole days.
const statusMeta: Record<
  HistoryCellStatus,
  { icon: typeof CircleCheck; iconClassName: string; cellClassName: string }
> = {
  took: {
    icon: CircleCheck,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    cellClassName: "bg-success/15",
  },
  not_taken: {
    icon: X,
    iconClassName: "text-destructive",
    cellClassName: "bg-destructive/10",
  },
  unclear: {
    icon: CircleHelp,
    iconClassName: "text-amber-600 dark:text-amber-400",
    cellClassName: "bg-warning/15",
  },
  no_answer: {
    icon: PhoneOff,
    iconClassName: "text-muted-foreground",
    cellClassName: "bg-muted",
  },
  pending: {
    icon: Clock,
    iconClassName: "text-muted-foreground",
    cellClassName: "bg-muted/50",
  },
  none: {
    icon: Minus,
    iconClassName: "text-muted-foreground/50",
    cellClassName: "",
  },
}

const dayFormat = (date: Date) =>
  new Intl.DateTimeFormat(i18n.language, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date)

const rangeFormat = (date: Date) =>
  new Intl.DateTimeFormat(i18n.language, {
    day: "2-digit",
    month: "2-digit",
  }).format(date)

function HistoryStatusIcon({ status }: { status: HistoryCellStatus }) {
  const { icon: Icon, iconClassName } = statusMeta[status]
  return <Icon aria-hidden className={cn("size-3.5 shrink-0", iconClassName)} />
}

function statusLabel(status: HistoryCellStatus, t: (key: string) => string) {
  return status === "none"
    ? t("wardDetail.historyNoCall")
    : t(`outcome.${status}`)
}

/**
 * Ward detail calendar: the Monday–Sunday week as seven full-width columns,
 * the ward's approved routines as rows; every cell tinted with that day's
 * call outcome (taken / missed / unclear / planned). Arrow buttons move
 * between weeks. Read-only summary — the full transcript lives in the
 * calls tab.
 */
export function RoutineHistoryCalendar({
  wardId,
  tz,
}: {
  wardId: string
  tz: string
}) {
  const { t } = useTranslation("wards")
  const [weekOffset, setWeekOffset] = useState(0)
  const { isPending: wardPending, data: ward } = useQuery({
    queryKey: ["ward", wardId],
    queryFn: () => fetchWard(wardId),
  })
  const { isPending: callsPending, data: calls = [] } = useQuery({
    queryKey: ["calls", wardId],
    queryFn: () => fetchCalls(wardId),
    refetchInterval: 5000,
  })

  if (wardPending || callsPending) {
    return (
      <div
        className="grid gap-2"
        role="status"
        aria-busy="true"
        aria-label={t("wardDetail.loadingCalls")}
      >
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const routines = ward?.routines ?? []
  const history = buildRoutineHistory({ routines, calls, tz, weekOffset })
  const todaySuffix = ` · ${t("wardDetail.historyToday")}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("wardDetail.historyTitle")}
        </CardTitle>
        <CardDescription>
          {t("wardDetail.historyDescription")}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => setWeekOffset((offset) => offset - 1)}
            aria-label={t("wardDetail.historyPrevWeek")}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span className="px-2 text-sm font-medium tabular-nums">
            {rangeFormat(new Date(`${history.days[0].key}T12:00:00`))}
            {" – "}
            {rangeFormat(new Date(`${history.days[6].key}T12:00:00`))}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => setWeekOffset((offset) => offset + 1)}
            aria-label={t("wardDetail.historyNextWeek")}
          >
            <ChevronRight aria-hidden />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {history.rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("wardDetail.historyNoRoutines")}
          </p>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {history.days.map((day, dayIndex) => (
              <div
                key={day.key}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-2",
                  day.isToday && "border-primary/50",
                )}
              >
                <div
                  className={cn(
                    "px-1 pb-1 text-xs font-medium text-muted-foreground",
                    day.isToday && "text-primary",
                  )}
                >
                  {dayFormat(new Date(`${day.key}T12:00:00`))}
                  {day.isToday && todaySuffix}
                </div>
                <ul className="flex flex-col gap-1">
                  {history.rows.map(({ routine, statuses }) => {
                    const status = statuses[dayIndex]
                    return (
                      <li
                        key={routine.id}
                        title={`${routine.name} · ${statusLabel(status, t)}`}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs",
                          statusMeta[status].cellClassName,
                        )}
                      >
                        <HistoryStatusIcon status={status} />
                        <span className="min-w-0 truncate font-medium">
                          {routine.name}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                          {routine.time_of_day}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
