import { type WardPublic, WardsService } from "@/client"
import {
  type CreateWardPayload,
  createWard as mockCreateWard,
  deactivateWard as mockDeactivateWard,
  getWard as mockGetWard,
  listWards as mockListWards,
  updateWard as mockUpdateWard,
  type UpdateWardPayload,
} from "@/mocks/store"
import type { WardWithToday } from "@/types/dashboard"
import { getWardsMode } from "./apiMode"
import { fetchCalls, fetchWardStats } from "./useCalls"
import { fetchRoutines } from "./useRoutines"

export { getWardsMode, type WardsMode } from "./apiMode"

/**
 * Ward hooks. The backend ships full wards CRUD since T05, so the tag
 * VITE_USE_MOCKS (frontend/.env) picks the data source:
 *   - unset / other → mocks (dev default, keeps demo data + today stats)
 *   - "empty"       → mocks with an empty list (empty-state preview)
 *   - "0"           → real API: GET/POST/PATCH/DELETE /wards
 * API mode enriches wards with persisted routines, calls and statistics.
 */

function toWardWithToday(ward: WardPublic): WardWithToday {
  return {
    id: ward.id,
    full_name: ward.full_name,
    phone_e164: ward.phone_e164,
    tz: ward.tz ?? "Europe/Warsaw",
    active: ward.active,
  }
}

async function enrichWard(ward: WardPublic): Promise<WardWithToday> {
  const [routines, calls, stats] = await Promise.all([
    fetchRoutines(ward.id),
    fetchCalls(ward.id),
    fetchWardStats(ward.id),
  ])
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ward.tz ?? "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const today = dateFormatter.format(new Date())
  return {
    ...toWardWithToday(ward),
    ...stats,
    routines: routines.map((routine) => {
      const latest = calls.find(
        (call) =>
          call.routine_id === routine.id &&
          dateFormatter.format(new Date(call.started_at)) === today,
      )
      return { ...routine, today_status: latest?.result?.outcome ?? "pending" }
    }),
  }
}

export async function fetchWards(): Promise<WardWithToday[]> {
  const mode = getWardsMode()

  if (mode === "api") {
    const { data } = await WardsService.readWards({ query: { limit: 500 } })
    return Promise.all(data.data.map(enrichWard))
  }

  const wards = await mockListWards()
  return mode === "empty" ? [] : wards
}

export async function fetchWard(id: string): Promise<WardWithToday> {
  const mode = getWardsMode()

  if (mode === "api") {
    const { data } = await WardsService.readWard({ path: { id } })
    return enrichWard(data)
  }

  return mockGetWard(id)
}

export async function addWard(
  payload: CreateWardPayload,
): Promise<WardWithToday> {
  const mode = getWardsMode()

  if (mode === "api") {
    const { data } = await WardsService.createWard({ body: payload })
    return toWardWithToday(data)
  }
  return mockCreateWard(payload)
}

export async function editWard(
  id: string,
  payload: UpdateWardPayload,
): Promise<WardWithToday> {
  const mode = getWardsMode()

  if (mode === "api") {
    const { data } = await WardsService.updateWard({
      path: { id },
      body: payload,
    })
    return toWardWithToday(data)
  }
  return mockUpdateWard(id, payload)
}

/** Soft delete per docs/04 B2 — the ward disappears, its history stays. */
export async function removeWard(id: string): Promise<void> {
  const mode = getWardsMode()

  if (mode === "api") {
    await WardsService.deleteWard({ path: { id } })
    return
  }
  return mockDeactivateWard(id)
}
