import { beforeEach, describe, expect, it } from "vitest"

import {
  approveRoutine,
  createRoutine,
  createWard,
  deleteRoutine,
  getWard,
  getWardStats,
  listCalls,
  listCallTasks,
  listRoutines,
  listWards,
  pauseRoutine,
  testCall,
  updateRoutine,
  updateWard,
} from "./store"

// The store is module-scoped (in memory), so tests create their own ward.
describe("mock store", () => {
  let wardId: string

  beforeEach(async () => {
    const ward = await createWard({
      full_name: "Testowy Podopieczny",
      phone_e164: "+48600999000",
      tz: "Europe/Warsaw",
    })
    wardId = ward.id
  })

  it("created ward appears in the list (POST /wards)", async () => {
    const wards = await listWards()
    const created = wards.find((w) => w.id === wardId)
    expect(created).toBeDefined()
    expect(created?.full_name).toBe("Testowy Podopieczny")
    expect(created?.phone_e164).toBe("+48600999000")
    expect(created?.today).toEqual({ took: 0, total: 0 })
    expect(created?.routines).toEqual([])
  })

  it("updateWard patches name and phone (PATCH /wards/{id})", async () => {
    await updateWard(wardId, {
      full_name: "Janina Testowa",
      phone_e164: "+48600111222",
    })
    const ward = await getWard(wardId)
    expect(ward.full_name).toBe("Janina Testowa")
    expect(ward.phone_e164).toBe("+48600111222")
  })

  it("created routine starts as a draft (POST /wards/{id}/routines)", async () => {
    const routine = await createRoutine(wardId, {
      name: "Poranne leki",
      time_of_day: "09:00",
      items: [
        {
          medication_id: "med-1",
          medication_name: "Warfarin",
          dosage: "5 mg",
          amount_label: "1",
        },
      ],
      depends_on: [],
    })
    expect(routine.status).toBe("draft")

    const ward = await getWard(wardId)
    expect(ward.routines).toHaveLength(1)
  })

  it("updateRoutine puts an approved routine back to draft (docs/04 C4)", async () => {
    const routine = await createRoutine(wardId, {
      name: "Poranne leki",
      time_of_day: "09:00",
      items: [
        {
          medication_id: "med-1",
          medication_name: "Warfarin",
          dosage: "5 mg",
          amount_label: "1",
        },
      ],
      depends_on: [],
    })
    const approved = await approveRoutine(routine.id)
    expect(approved.status).toBe("approved")

    const edited = await updateRoutine(routine.id, {
      name: "Poranne leki (zmiana)",
      time_of_day: "09:30",
      items: routine.items,
      depends_on: [],
    })
    expect(edited.status).toBe("draft")
  })

  it("approve schedules a pending call task (POST /routines/{id}/approve)", async () => {
    const routine = await createRoutine(wardId, {
      name: "Poranne leki",
      time_of_day: "09:00",
      items: [
        {
          medication_id: "med-1",
          medication_name: "Warfarin",
          dosage: "5 mg",
          amount_label: "1",
        },
      ],
      depends_on: [],
    })
    await approveRoutine(routine.id)

    const tasks = await listCallTasks(wardId)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].routine_id).toBe(routine.id)
    expect(tasks[0].status).toBe("pending")
  })

  it("approve without items throws (docs/05: 409)", async () => {
    const routine = await createRoutine(wardId, {
      name: "Pusta rutyna",
      time_of_day: "10:00",
      items: [],
      depends_on: [],
    })
    await expect(approveRoutine(routine.id)).rejects.toThrow(
      "Nie można zatwierdzić rutyny bez leków",
    )
  })

  it("deleteRoutine removes approved routines and their scheduled tasks", async () => {
    const routine = await createRoutine(wardId, {
      name: "Poranne leki",
      time_of_day: "09:00",
      items: [
        {
          medication_id: "med-1",
          medication_name: "Warfarin",
          dosage: "5 mg",
          amount_label: "1",
        },
      ],
      depends_on: [],
    })
    await approveRoutine(routine.id)
    await expect(listCallTasks(wardId)).resolves.toHaveLength(1)
    await expect(deleteRoutine(routine.id)).resolves.toBeUndefined()
    await expect(listRoutines(wardId)).resolves.toHaveLength(0)
    // the schedule derives from approved routines — it must be gone too
    await expect(listCallTasks(wardId)).resolves.toHaveLength(0)
  })

  it("pause toggles the routine status (POST /routines/{id}/pause)", async () => {
    const routine = await createRoutine(wardId, {
      name: "Poranne leki",
      time_of_day: "09:00",
      items: [
        {
          medication_id: "med-1",
          medication_name: "Warfarin",
          dosage: "5 mg",
          amount_label: "1",
        },
      ],
      depends_on: [],
    })
    await approveRoutine(routine.id)
    const paused = await pauseRoutine(routine.id, true)
    expect(paused.status).toBe("paused")
    const resumed = await pauseRoutine(routine.id, false)
    expect(resumed.status).toBe("approved")
  })

  it("testCall requires an approved routine and records a call", async () => {
    await expect(testCall(wardId)).rejects.toThrow("zatwierdzonej rutyny")

    const routine = await createRoutine(wardId, {
      name: "Poranne leki",
      time_of_day: "09:00",
      items: [
        {
          medication_id: "med-1",
          medication_name: "Warfarin",
          dosage: "5 mg",
          amount_label: "1",
        },
      ],
      depends_on: [],
    })
    await approveRoutine(routine.id)
    const call = await testCall(wardId)
    expect(call.status).toBe("completed")
    expect(call.result).not.toBeNull()
    expect(call.turns.length).toBeGreaterThan(0)

    const history = await listCalls(wardId)
    expect(history).toHaveLength(1)
  })

  it("stats reflect today's calls and the 7-day adherence (GET /wards/{id}/stats)", async () => {
    const routine = await createRoutine(wardId, {
      name: "Poranne leki",
      time_of_day: "09:00",
      items: [
        {
          medication_id: "med-1",
          medication_name: "Warfarin",
          dosage: "5 mg",
          amount_label: "1",
        },
      ],
      depends_on: [],
    })
    await approveRoutine(routine.id)
    await testCall(wardId)

    const stats = await getWardStats(wardId)
    expect(stats.today.total).toBeGreaterThanOrEqual(1)
    expect(stats.week_pct).toBeGreaterThanOrEqual(0)
    expect(stats.week_pct).toBeLessThanOrEqual(100)
  })
})
