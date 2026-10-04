import { describe, expect, it } from "vitest"

import { buildRoutineHistory } from "./routineHistory"
import type { Call, CallOutcome, Routine } from "@/types/dashboard"

const TZ = "Europe/Warsaw"
// 2026-10-04 23:30 in Warsaw → the ward's "today" is 2026-10-04.
const NOW = new Date("2026-10-04T21:30:00Z")

function makeRoutine(id: string, status: Routine["status"] = "approved"): Routine {
  return {
    id,
    ward_id: "w-1",
    name: `Routine ${id}`,
    time_of_day: "09:00",
    status,
    items: [],
    depends_on: [],
  }
}

function makeCall(
  id: string,
  routineId: string,
  startedAt: string,
  outcome?: CallOutcome,
): Call {
  return {
    id,
    ward_id: "w-1",
    call_task_id: `task-${id}`,
    routine_id: routineId,
    routine: { name: "Routine", time_of_day: "09:00" },
    status: "completed",
    started_at: startedAt,
    duration_sec: 30,
    attempt_no: 1,
    result: outcome
      ? { outcome, confidence: 0.9, transcript_full: "", notes: null }
      : null,
    turns: [],
  }
}

describe("buildRoutineHistory", () => {
  const routines = [
    makeRoutine("r-1"),
    makeRoutine("r-2"),
    makeRoutine("r-draft", "draft"),
  ]
  const calls = [
    // Yesterday morning (Warsaw): r-1 took.
    makeCall("c-1", "r-1", "2026-10-03T07:05:00Z", "took"),
    // Today: an earlier took call …
    makeCall("c-2", "r-1", "2026-10-04T06:00:00Z", "took"),
    // … and a later not_taken one — the latest call wins.
    makeCall("c-3", "r-1", "2026-10-04T07:00:00Z", "not_taken"),
    // Today: r-2 call still without a parsed result → pending.
    makeCall("c-4", "r-2", "2026-10-04T17:00:00Z"),
  ]

  const history = buildRoutineHistory({
    routines,
    calls,
    tz: TZ,
    now: NOW,
  })

  it("builds the Monday–Sunday week containing today in the ward timezone", () => {
    expect(history.days).toHaveLength(7)
    // NOW is Sunday 2026-10-04 → the week runs Mon 28.09 – Sun 04.10.
    expect(history.days[0].key).toBe("2026-09-28")
    expect(history.days[6].key).toBe("2026-10-04")
    expect(history.todayIndex).toBe(6)
    expect(history.days.map((day) => day.isToday)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ])
  })

  it("keeps one row per callable routine, drafts excluded, order preserved", () => {
    expect(history.rows.map((row) => row.routine.id)).toEqual(["r-1", "r-2"])
  })

  it("maps the latest call outcome per routine and day", () => {
    const [r1, r2] = history.rows
    expect(r1.statuses).toEqual([
      "none",
      "none",
      "none",
      "none",
      "none",
      "took",
      "not_taken",
    ])
    // r-2 was only called today and the call has no result yet.
    expect(r2.statuses).toEqual([
      "none",
      "none",
      "none",
      "none",
      "none",
      "none",
      "pending",
    ])
  })

  it("reports none in the past but planned (pending) today without calls", () => {
    const history = buildRoutineHistory({
      routines: [makeRoutine("r-9")],
      calls: [],
      tz: TZ,
      now: NOW,
    })
    expect(history.rows[0].statuses).toEqual([
      "none",
      "none",
      "none",
      "none",
      "none",
      "none",
      "pending",
    ])
  })

  it("navigates weeks: next week is fully planned, previous fully past", () => {
    const approved = makeRoutine("r-1")
    const paused = makeRoutine("r-paused", "paused")
    const nextWeek = buildRoutineHistory({
      routines: [approved, paused],
      calls: [],
      tz: TZ,
      now: NOW,
      weekOffset: 1,
    })
    expect(nextWeek.days[0].key).toBe("2026-10-05")
    expect(nextWeek.days[6].key).toBe("2026-10-11")
    expect(nextWeek.todayIndex).toBe(-1)
    // Approved routines stay planned on every day of the coming week…
    expect(
      nextWeek.rows[0].statuses.every((status) => status === "pending"),
    ).toBe(true)
    // …while paused routines are not scheduled at all.
    expect(
      nextWeek.rows[1].statuses.every((status) => status === "none"),
    ).toBe(true)

    const prevWeek = buildRoutineHistory({
      routines: [approved],
      calls: [],
      tz: TZ,
      now: NOW,
      weekOffset: -1,
    })
    expect(prevWeek.days[0].key).toBe("2026-09-21")
    expect(prevWeek.days[6].key).toBe("2026-09-27")
    expect(
      prevWeek.rows[0].statuses.every((status) => status === "none"),
    ).toBe(true)
  })
})
