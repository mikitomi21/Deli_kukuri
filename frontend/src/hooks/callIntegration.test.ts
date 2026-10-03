import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CallsService, RoutinesService } from "@/client"
import { fetchCalls, startTestCall } from "./useCalls"
import { addRoutine, fetchRoutines, pauseRoutine } from "./useRoutines"

vi.mock("@/client", () => ({
  CallsService: { createTestCall: vi.fn(), readCalls: vi.fn() },
  RoutinesService: {
    createRoutine: vi.fn(),
    readRoutinesForWard: vi.fn(),
    approveRoutine: vi.fn(),
    pauseRoutine: vi.fn(),
  },
}))

const routine = {
  id: "routine-id",
  ward_id: "ward-id",
  name: "Morning",
  time_of_day: "09:00:00",
  status: "approved",
  items: [
    {
      id: "item-id",
      medication_id: "med-id",
      amount_label: "1 tablet",
      medication: { id: "med-id", name: "Medication", dosage: "5 mg" },
    },
  ],
  depends_on: [
    { id: "prerequisite-id", name: "Prerequisite", status: "approved" },
  ],
}

describe("real call and routine API integration", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_USE_MOCKS", "0")
    vi.clearAllMocks()
  })
  afterEach(() => vi.unstubAllEnvs())

  it("queues a call through the API without inventing a completed result", async () => {
    vi.mocked(CallsService.createTestCall).mockResolvedValue({
      data: { id: "task-id", status: "pending" },
    } as never)
    const queued = await startTestCall("ward-id")
    expect(CallsService.createTestCall).toHaveBeenCalledWith({
      path: { ward_id: "ward-id" },
    })
    expect(queued.id).toBe("task-id")
    expect(queued).not.toHaveProperty("result")
  })

  it("maps persisted routines and sends only API contract fields", async () => {
    vi.mocked(RoutinesService.readRoutinesForWard).mockResolvedValue({
      data: { data: [routine] },
    } as never)
    const [mapped] = await fetchRoutines("ward-id")
    expect(mapped.time_of_day).toBe("09:00")
    expect(mapped.items[0].medication_name).toBe("Medication")
    expect(mapped.depends_on).toEqual(["prerequisite-id"])
    vi.mocked(RoutinesService.createRoutine).mockResolvedValue({
      data: routine,
    } as never)
    await addRoutine("ward-id", {
      name: "Morning",
      time_of_day: "09:00",
      items: mapped.items,
    })
    expect(RoutinesService.createRoutine).toHaveBeenCalledWith({
      path: { ward_id: "ward-id" },
      body: {
        name: "Morning",
        time_of_day: "09:00",
        days: "daily",
        depends_on: [],
        items: [{ medication_id: "med-id", amount_label: "1 tablet" }],
      },
    })
  })

  it("resumes a routine by approving it so the backend rematerializes its schedule", async () => {
    vi.mocked(RoutinesService.approveRoutine).mockResolvedValue({
      data: routine,
    } as never)
    await pauseRoutine("routine-id", false)
    expect(RoutinesService.approveRoutine).toHaveBeenCalledWith({
      path: { id: "routine-id" },
    })
    expect(RoutinesService.pauseRoutine).not.toHaveBeenCalled()
  })

  it("maps real provider statuses and preserves the transcript and summary", async () => {
    vi.mocked(CallsService.readCalls).mockResolvedValue({
      data: {
        data: [
          {
            id: "call-id",
            ward_id: "ward-id",
            call_task_id: "task-id",
            routine_id: "routine-id",
            routine: { name: "Morning", time_of_day: "09:00:00" },
            status: "in-progress",
            started_at: "2026-10-03T07:00:00Z",
            duration_sec: 34,
            attempt_no: 1,
            result: {
              outcome: "took",
              confidence: 0,
              transcript_full: "USER: Yes",
              notes: "Medication confirmed",
            },
            turns: [],
          },
        ],
      },
    } as never)
    const [call] = await fetchCalls("ward-id")
    expect(call.status).toBe("in_progress")
    expect(call.result?.transcript_full).toBe("USER: Yes")
    expect(call.result?.notes).toBe("Medication confirmed")
  })
})
