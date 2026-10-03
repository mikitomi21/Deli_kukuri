import type { Call, CallOutcome, Routine } from "@/types/dashboard"

/**
 * 7-day routine history for the ward detail calendar: one column per day,
 * one cell per routine with the day's call outcome (or no call at all).
 * Day grouping follows the same convention as the ward enrichment in
 * src/hooks/useWards.ts — call.started_at formatted in the ward timezone.
 */

export type HistoryCellStatus = CallOutcome | "pending" | "none"

export interface RoutineHistoryDay {
  /** YYYY-MM-DD calendar day in the ward timezone. */
  key: string
  isToday: boolean
}

export interface RoutineHistoryCell {
  routine: Routine
  status: HistoryCellStatus
}

export interface RoutineHistory {
  days: RoutineHistoryDay[]
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
 * (still in progress / failed) counts as "pending", no call as "none".
 */
export function buildRoutineHistory({
  routines,
  calls,
  tz,
  now = new Date(),
}: {
  routines: Routine[]
  calls: Call[]
  tz: string
  now?: Date
}): RoutineHistory {
  const callable = routines.filter((routine) => routine.status !== "draft")
  const todayKey = isoDayKey(now, tz)
  const todayNoon = Date.parse(`${todayKey}T12:00:00Z`)
  const days: RoutineHistoryDay[] = Array.from({ length: 7 }, (_, i) => {
    const key = new Date(todayNoon - (6 - i) * DAY_MS).toISOString().slice(0, 10)
    return { key, isToday: key === todayKey }
  })
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
    rows: callable.map((routine) => ({
      routine,
      statuses: days.map((_day, index) => {
        const call = latest.get(`${routine.id}|${index}`)
        if (!call) return "none"
        return (call.result?.outcome ?? "pending") as HistoryCellStatus
      }),
    })),
  }
}
