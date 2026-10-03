import { WardsService } from "@/client"
import { getWardsMode } from "@/hooks/useWards"
import {
  getCall as mockGetCall,
  listCalls as mockListCalls,
  listCallTasks as mockListCallTasks,
  testCall as mockTestCall,
} from "@/mocks/store"
import type { Call, CallTask, WardStats } from "@/types/dashboard"

/**
 * Call hooks. Planned call-tasks (the schedule) are served by the backend
 * since GET /wards/{ward_id}/call-tasks landed — materialized on the fly
 * from approved routines. Call history, details, test-call and stats are
 * still TODO(api): the backend does not expose them yet (mock store only).
 */
export async function fetchCallTasks(wardId: string): Promise<CallTask[]> {
  if (getWardsMode() === "api") {
    const { data } = await WardsService.readWardCallTasks({
      path: { ward_id: wardId },
      query: { status: "pending" },
    })
    return data.data.map((task) => ({
      id: task.id,
      ward_id: task.ward_id,
      routine_id: task.routine_id,
      routine_name: task.routine_name,
      scheduled_at: task.scheduled_at,
      status: "pending" as const,
      attempt_no: task.attempt_no,
    }))
  }
  return mockListCallTasks(wardId)
}

export async function fetchCalls(wardId: string): Promise<Call[]> {
  // TODO(api): GET /wards/{ward_id}/calls
  return mockListCalls(wardId)
}

export async function fetchCall(callId: string): Promise<Call> {
  // TODO(api): GET /calls/{id}
  return mockGetCall(callId)
}

/** docs/05: POST /wards/{ward_id}/test-call — immediate test call. */
export async function startTestCall(wardId: string): Promise<Call> {
  // TODO(api): POST /wards/{ward_id}/test-call
  return mockTestCall(wardId)
}

export async function fetchWardStats(wardId: string): Promise<WardStats> {
  // TODO(api): GET /wards/{ward_id}/stats
  return mockGetWardStatsBridge(wardId)
}

async function mockGetWardStatsBridge(wardId: string): Promise<WardStats> {
  const { getWardStats } = await import("@/mocks/store")
  return getWardStats(wardId)
}
