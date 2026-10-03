import { type RoutinePublic, RoutinesService } from "@/client"
import { getWardsMode } from "@/hooks/useWards"
import {
  approveRoutine as mockApproveRoutine,
  createRoutine as mockCreateRoutine,
  deleteRoutine as mockDeleteRoutine,
  listRoutinesWithOutcomes as mockListRoutinesWithOutcomes,
  pauseRoutine as mockPauseRoutine,
  updateRoutine as mockUpdateRoutine,
  type RoutinePayload,
} from "@/mocks/store"
import type { Routine, RoutineWithOutcome } from "@/types/dashboard"

/**
 * Routine hooks — docs/05-api-spec.md. The backend ships the full routine
 * set (create/list/edit/delete/approve/pause), so the VITE_USE_MOCKS flag
 * picks the source (same contract as src/hooks/useWards.ts):
 *   - unset / "0" / "false" → real API via the generated client (default)
 *   - "mocks" / "1"         → mock store (demo data + today outcomes)
 *   - "empty"               → mocks (the flag only empties the wards list)
 * Call-tasks, calls and stats stay mock-only — see src/hooks/useCalls.ts.
 */

export type { RoutinePayload }

/**
 * Backend RoutinePublic → dashboard Routine: nested medication objects get
 * flattened into display fields and dependency objects reduce to IDs, which
 * is what the RoutineDialog and actions menu consume.
 */
export function toRoutine(routine: RoutinePublic): Routine {
  return {
    id: routine.id,
    ward_id: routine.ward_id,
    name: routine.name,
    time_of_day: routine.time_of_day.slice(0, 5),
    status: routine.status as Routine["status"],
    depends_on: (routine.depends_on ?? []).map((dep) => dep.id),
    items: (routine.items ?? []).map((item) => ({
      medication_id: item.medication_id,
      medication_name: item.medication?.name ?? "",
      dosage: item.medication?.dosage ?? "",
      amount_label: item.amount_label,
    })),
  }
}

/**
 * Domain payload → API body (docs/05): items reduce to
 * {medication_id, amount_label} and MVP routines are always "daily".
 */
export function toRoutineBody(payload: RoutinePayload) {
  return {
    name: payload.name,
    time_of_day: payload.time_of_day,
    days: "daily",
    items: payload.items.map((item) => ({
      medication_id: item.medication_id,
      amount_label: item.amount_label,
    })),
    depends_on: payload.depends_on ?? [],
  }
}

export async function fetchRoutines(
  wardId: string,
): Promise<RoutineWithOutcome[]> {
  if (getWardsMode() === "api") {
    const { data } = await RoutinesService.readRoutinesForWard({
      path: { ward_id: wardId },
      query: { limit: 500 },
    })
    // today_status stays undefined in API mode (stats are backend TODO)
    return data.data.map(toRoutine)
  }
  // Mocks keep today's outcome badges (RoutineWithOutcome extends Routine).
  return mockListRoutinesWithOutcomes(wardId)
}

export async function addRoutine(
  wardId: string,
  payload: RoutinePayload,
): Promise<Routine> {
  if (getWardsMode() === "api") {
    const { data } = await RoutinesService.createRoutine({
      path: { ward_id: wardId },
      body: toRoutineBody(payload),
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
      body: toRoutineBody(payload),
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
    // The backend has no dedicated resume endpoint (docs/05 lists pause only):
    // approving a paused routine re-enters `approved` and restores scheduling.
    const call = paused
      ? RoutinesService.pauseRoutine({ path: { id: routineId } })
      : RoutinesService.approveRoutine({ path: { id: routineId } })
    const { data } = await call
    return toRoutine(data)
  }
  return mockPauseRoutine(routineId, paused)
}
