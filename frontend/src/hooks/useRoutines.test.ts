import { describe, expect, it } from "vitest"

import type { RoutinePublic } from "@/client"

import { toRoutine, toRoutineBody } from "./useRoutines"

/** Minimal backend RoutinePublic, as serialized by FastAPI (T06). */
const apiRoutine: RoutinePublic = {
  id: "r-1",
  ward_id: "w-1",
  name: "Poranne leki",
  time_of_day: "09:00:00",
  days: "daily",
  status: "approved",
  created_at: "2026-10-03T08:00:00Z",
  items: [
    {
      id: "i-1",
      medication_id: "med-1",
      amount_label: "1 tabletka",
      medication: { id: "med-1", name: "Warfarin", dosage: "5 mg" },
    },
    {
      id: "i-2",
      medication_id: "med-2",
      amount_label: "pół tabletki",
      medication: null,
    },
  ],
  depends_on: [{ id: "r-0", name: "Rutyna wcześniejsza", status: "approved" }],
}

describe("toRoutine", () => {
  it("flattens nested medication objects into display fields", () => {
    const routine = toRoutine(apiRoutine)
    expect(routine.items[0]).toEqual({
      medication_id: "med-1",
      medication_name: "Warfarin",
      dosage: "5 mg",
      amount_label: "1 tabletka",
    })
  })

  it("keeps the item usable when the medication row is gone", () => {
    const routine = toRoutine(apiRoutine)
    expect(routine.items[1].medication_name).toBe("")
    expect(routine.items[1].dosage).toBe("")
  })

  it("reduces dependency objects to prerequisite ids", () => {
    expect(toRoutine(apiRoutine).depends_on).toEqual(["r-0"])
  })

  it("trims seconds from time_of_day for display", () => {
    expect(toRoutine(apiRoutine).time_of_day).toBe("09:00")
  })

  it("tolerates missing items and dependencies", () => {
    const routine = toRoutine({
      ...apiRoutine,
      items: undefined,
      depends_on: undefined,
    })
    expect(routine.items).toEqual([])
    expect(routine.depends_on).toEqual([])
  })
})

describe("toRoutineBody", () => {
  it("reduces items to medication_id + amount_label and sets days", () => {
    const body = toRoutineBody({
      name: "Wieczorne leki",
      time_of_day: "19:30",
      items: [
        {
          medication_id: "med-1",
          medication_name: "Warfarin",
          dosage: "5 mg",
          amount_label: "1 tabletka",
        },
      ],
      depends_on: ["r-0"],
    })
    expect(body).toEqual({
      name: "Wieczorne leki",
      time_of_day: "19:30",
      days: "daily",
      items: [{ medication_id: "med-1", amount_label: "1 tabletka" }],
      depends_on: ["r-0"],
    })
  })

  it("defaults depends_on to an empty list", () => {
    const body = toRoutineBody({
      name: "Leki",
      time_of_day: "08:00",
      items: [
        {
          medication_id: "med-2",
          medication_name: "Metformina",
          dosage: "850 mg",
          amount_label: "1 tabletka",
        },
      ],
    })
    expect(body.depends_on).toEqual([])
  })
})
