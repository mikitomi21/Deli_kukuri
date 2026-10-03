import { type RoutinePublic, RoutinesService } from "@/client"
import {
  approveRoutine as mockApproveRoutine,
  createRoutine as mockCreateRoutine,
  deleteRoutine as mockDeleteRoutine,
  listRoutines as mockListRoutines,
  pauseRoutine as mockPauseRoutine,
  updateRoutine as mockUpdateRoutine,
  type RoutinePayload,
} from "@/mocks/store"
import type { Routine } from "@/types/dashboard"
import { getWardsMode } from "./apiMode"

/**
 * Routine hooks select the generated API client or the local demo store.
 */

export type { RoutinePayload }

export function toRoutine(data: RoutinePublic): Routine {
  return {
    id: data.id,
    ward_id: data.ward_id,
    name: data.name,
    time_of_day: data.time_of_day.slice(0, 5),
    status: data.status as Routine["status"],
    items: (data.items ?? []).map((item) => ({
      medication_id: item.medication_id,
      medication_name: item.medication?.name ?? "",
      dosage: item.medication?.dosage ?? "",
      amount_label: item.amount_label,
    })),
    depends_on: (data.depends_on ?? []).map((routine) => routine.id),
  }
}

function toPayload(payload: RoutinePayload) {
  return {
    name: payload.name,
    time_of_day: payload.time_of_day,
    items: payload.items.map(({ medication_id, amount_label }) => ({
      medication_id,
      amount_label,
    })),
    depends_on: payload.depends_on ?? [],
  }
}

export async function fetchRoutines(wardId: string): Promise<Routine[]> {
  if (getWardsMode() === "api") {
    const { data } = await RoutinesService.readRoutinesForWard({
      path: { ward_id: wardId },
    })
    return data.data.map(toRoutine)
  }
  return mockListRoutines(wardId)
}

export async function addRoutine(
  wardId: string,
  payload: RoutinePayload,
): Promise<Routine> {
  if (getWardsMode() === "api") {
    const { data } = await RoutinesService.createRoutine({
      path: { ward_id: wardId },
      body: toPayload(payload),
    })
    return toRoutine(data)
  }
  return mockCreateRoutine(wardId, payload)
}

export async function saveRoutine(
  routineId: string,
  payload: RoutinePayload,
): Promise<Routine> {
  if (getWardsMode() === "api") {
    const { data } = await RoutinesService.updateRoutine({
      path: { id: routineId },
      body: toPayload(payload),
    })
    return toRoutine(data)
  }
  return mockUpdateRoutine(routineId, payload)
}

export async function removeRoutine(routineId: string): Promise<void> {
  if (getWardsMode() === "api") {
    await RoutinesService.deleteRoutine({ path: { id: routineId } })
    return
  }
  return mockDeleteRoutine(routineId)
}

export async function approveRoutine(routineId: string): Promise<Routine> {
  if (getWardsMode() === "api") {
    const { data } = await RoutinesService.approveRoutine({
      path: { id: routineId },
    })
    return toRoutine(data)
  }
  return mockApproveRoutine(routineId)
}

export async function pauseRoutine(
  routineId: string,
  paused: boolean,
): Promise<Routine> {
  if (getWardsMode() === "api") {
    const operation = paused
      ? RoutinesService.pauseRoutine
      : RoutinesService.approveRoutine
    const { data } = await operation({ path: { id: routineId } })
    return toRoutine(data)
  }
  return mockPauseRoutine(routineId, paused)
}
