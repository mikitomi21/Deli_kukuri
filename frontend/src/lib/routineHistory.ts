import type { Call, CallOutcome, Routine } from "@/types/dashboard"

/**
 * Routine history calendar data: exactly one Monday–Sunday week as columns,
 * one cell per routine with that day's call outcome. Day grouping follows
 * the same convention as the ward enrichment in src/hooks/useWards.ts —
 * call.started_at formatted in the ward timezone.
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
  /** Index of today's column inside days, -1 for other weeks. */
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
 * The Monday–Sunday week containing today (shifted by weekOffset weeks).
 * Latest call wins per (routine, day) — the same "latest outcome" rule the
 * ward enrichment uses for today_status. A call without a parsed result
 * (still in progress / failed) counts as "pending".
 */
export function buildRoutineHistory({
  routines,
  calls,
  tz,
  now = new Date(),
  weekOffset = 0,
}: {
  routines: Routine[]
  calls: Call[]
  tz: string
  now?: Date
  /** 0 = current week, -1 = previous week, +1 = next week, … */
  weekOffset?: number
}): RoutineHistory {
  const callable = routines.filter((routine) => routine.status !== "draft")
  const todayKey = isoDayKey(now, tz)
  const todayNoon = Date.parse(`${todayKey}T12:00:00Z`)
  const mondayNoon =
    todayNoon - ((new Date(todayNoon).getUTCDay() + 6) % 7) * DAY_MS +
    weekOffset * 7 * DAY_MS
  const days: RoutineHistoryDay[] = Array.from({ length: 7 }, (_, i) => {
    const key = new Date(mondayNoon + i * DAY_MS).toISOString().slice(0, 10)
    return { key, isToday: key === todayKey }
  })
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
    todayIndex,
    rows: callable.map((routine) => ({
      routine,
      statuses: days.map((day) => {
        const call = latest.get(`${routine.id}|${dayIndex.get(day.key)}`)
        if (call) return (call.result?.outcome ?? "pending") as HistoryCellStatus
        // Today and ahead the call is still planned, not missing.
        if (day.key >= todayKey && routine.status === "approved") {
          return "pending"
        }
        return "none"
      }),
    })),
  }
}
