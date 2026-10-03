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

/**
 * Routine hooks — TODO(api): the backend does not ship routines yet
 * (docs/05-api-spec.md). Everything goes through the mock store; once the
 * endpoints land, swap each body for the generated client call and keep the
 * same signatures.
 */

export type { RoutinePayload }

export async function fetchRoutines(wardId: string): Promise<Routine[]> {
  // TODO(api): GET /wards/{ward_id}/routines
  return mockListRoutines(wardId)
}

export async function addRoutine(
  wardId: string,
  payload: RoutinePayload,
): Promise<Routine> {
  // TODO(api): POST /wards/{ward_id}/routines
  return mockCreateRoutine(wardId, payload)
}

export async function saveRoutine(
  routineId: string,
  payload: RoutinePayload,
): Promise<Routine> {
  // TODO(api): PATCH /routines/{routine_id}
  return mockUpdateRoutine(routineId, payload)
}

export async function removeRoutine(routineId: string): Promise<void> {
  // TODO(api): DELETE /routines/{routine_id}
  return mockDeleteRoutine(routineId)
}

export async function approveRoutine(routineId: string): Promise<Routine> {
  // TODO(api): POST /routines/{routine_id}/approve
  return mockApproveRoutine(routineId)
}

export async function pauseRoutine(
  routineId: string,
  paused: boolean,
): Promise<Routine> {
  // TODO(api): POST /routines/{routine_id}/pause
  return mockPauseRoutine(routineId, paused)
}
