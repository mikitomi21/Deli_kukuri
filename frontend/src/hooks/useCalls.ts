import { type CallPublic, CallsService } from "@/client"
import {
  getCall as mockGetCall,
  listCalls as mockListCalls,
  listCallTasks as mockListCallTasks,
  testCall as mockTestCall,
} from "@/mocks/store"
import type { Call, CallTask, WardStats } from "@/types/dashboard"
import { getWardsMode } from "./apiMode"
import { fetchRoutines } from "./useRoutines"

function toCall(data: CallPublic): Call {
  return {
    ...data,
    status: data.status.replace("-", "_") as Call["status"],
    routine: {
      name: data.routine.name,
      time_of_day: data.routine.time_of_day.slice(0, 5),
    },
    result: data.result
      ? {
          ...data.result,
          outcome: data.result.outcome as NonNullable<
            Call["result"]
          >["outcome"],
        }
      : null,
    turns: (data.turns ?? []).map((turn) => ({
      ...turn,
      parsed: turn.parsed as Call["turns"][number]["parsed"],
    })),
  }
}

/**
 * Call hooks select the generated API client or the local demo store.
 */

export async function fetchCallTasks(wardId: string): Promise<CallTask[]> {
  if (getWardsMode() === "api") {
    const [{ data }, routines] = await Promise.all([
      CallsService.readCallTasks({
        path: { ward_id: wardId },
        query: { status: "pending", limit: 500 },
      }),
      fetchRoutines(wardId),
    ])
    return data.data.map((task) => ({
      ...task,
      ward_id: wardId,
      routine_name:
        routines.find((routine) => routine.id === task.routine_id)?.name ?? "",
      status: (task.status === "cancelled"
        ? "canceled"
        : task.status) as CallTask["status"],
    }))
  }
  return mockListCallTasks(wardId)
}

export async function fetchCalls(wardId: string): Promise<Call[]> {
  if (getWardsMode() === "api") {
    const { data } = await CallsService.readCalls({ path: { ward_id: wardId } })
    return data.data.map(toCall)
  }
  return mockListCalls(wardId)
}

export async function fetchCall(callId: string): Promise<Call> {
  if (getWardsMode() === "api") {
    const { data } = await CallsService.readCall({ path: { id: callId } })
    return toCall(data)
  }
  return mockGetCall(callId)
}

/** Manually send this call's summary to the configured administrator. */
export async function sendCallSummarySms(callId: string): Promise<void> {
  await CallsService.sendCallSummarySms({ path: { id: callId } })
}

/** docs/05: POST /wards/{ward_id}/test-call — immediate test call. */
export async function startTestCall(wardId: string): Promise<{ id: string }> {
  if (getWardsMode() === "api") {
    const { data } = await CallsService.createTestCall({
      path: { ward_id: wardId },
    })
    return data
  }
  return mockTestCall(wardId)
}

export async function fetchWardStats(wardId: string): Promise<WardStats> {
  if (getWardsMode() === "api") {
    const { data } = await CallsService.readStats({ path: { ward_id: wardId } })
    return data
  }
  return mockGetWardStatsBridge(wardId)
}

async function mockGetWardStatsBridge(wardId: string): Promise<WardStats> {
  const { getWardStats } = await import("@/mocks/store")
  return getWardStats(wardId)
}
