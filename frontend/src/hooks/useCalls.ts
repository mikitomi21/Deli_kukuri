import {
  getCall as mockGetCall,
  listCalls as mockListCalls,
  listCallTasks as mockListCallTasks,
  testCall as mockTestCall,
} from "@/mocks/store"
import type { Call, CallTask, WardStats } from "@/types/dashboard"

/**
 * Call hooks — TODO(api): the backend does not ship calls/call-tasks yet
 * (docs/05-api-spec.md). Mock store only; swap the bodies when the endpoints
 * land.
 */

export async function fetchCallTasks(wardId: string): Promise<CallTask[]> {
  // TODO(api): GET /wards/{ward_id}/call-tasks?status=pending
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
