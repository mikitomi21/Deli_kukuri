import type { Call, CallOutcome, Routine } from "@/types/dashboard"

/**
 * Routine history calendar data: one column per day (past week, today and,
 * optionally, upcoming days), one cell per routine with that day's call
 * outcome. Day grouping follows the same convention as the ward enrichment
 * in src/hooks/useWards.ts — call.started_at formatted in the ward timezone.
 *
 * Today and future days without a call render approved routines as
 * "pending" (still planned), past days without a call as "none".
 */

export type HistoryCellStatus = CallOutcome | "pending" | "none"

export interface RoutineHistoryDay {
  /** YYYY-MM-DD calendar day in the ward timezone. */
  key: string
  isToday: boolean
}

export interface RoutineHistory {
  days: RoutineHistoryDay[]
  /** Index of today's column inside days (auto-scroll target). */
  todayIndex: number
  /** One row per routine; row[dayIndex] aligns with days[dayIndex]. */
  rows: Array<{ routine: Routine; statuses: HistoryCellStatus[] }>
}

const DAY_MS = 24 * 3600 * 1000

function isoDayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/**
 * Latest call wins per (routine, day) — the same "latest outcome" rule the
 * ward enrichment uses for today_status. A call without a parsed result
 * (still in progress / failed) counts as "pending".
 */
export function buildRoutineHistory({
  routines,
  calls,
  tz,
  now = new Date(),
  futureDays = 0,
}: {
  routines: Routine[]
  calls: Call[]
  tz: string
  now?: Date
  /** Upcoming days to append after today (planned, no outcomes yet). */
  futureDays?: number
}): RoutineHistory {
  const callable = routines.filter((routine) => routine.status !== "draft")
  const todayKey = isoDayKey(now, tz)
  const todayNoon = Date.parse(`${todayKey}T12:00:00Z`)
  const days: RoutineHistoryDay[] = Array.from(
    { length: 7 + futureDays },
    (_, i) => {
      const key = new Date(
        todayNoon + (i - 6) * DAY_MS,
      ).toISOString().slice(0, 10)
      return { key, isToday: key === todayKey }
    },
  )
  const todayIndex = days.findIndex((day) => day.isToday)
  const dayIndex = new Map(days.map((day, index) => [day.key, index]))

  // Latest call per (routine, day): started_at descending.
  const latest = new Map<string, Call>()
  const sorted = [...calls].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  )
  for (const call of sorted) {
    if (!call.routine_id) continue
    const index = dayIndex.get(isoDayKey(new Date(call.started_at), tz))
    if (index === undefined) continue
    const key = `${call.routine_id}|${index}`
    if (!latest.has(key)) latest.set(key, call)
  }

  return {
    days,
    todayIndex: todayIndex === -1 ? days.length - 1 : todayIndex,
    rows: callable.map((routine) => ({
      routine,
      statuses: days.map((_day, index) => {
        const call = latest.get(`${routine.id}|${index}`)
        if (call) return (call.result?.outcome ?? "pending") as HistoryCellStatus
        // Today and ahead the call is still planned, not missing.
        if (index >= todayIndex && routine.status === "approved") {
          return "pending"
        }
        return "none"
      }),
    })),
  }
}
