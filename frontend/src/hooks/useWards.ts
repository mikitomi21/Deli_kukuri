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

/**
 * Ward hooks. The backend ships full wards CRUD since T05, so the tag
 * VITE_USE_MOCKS (frontend/.env) picks the data source:
 *   - unset / other → mocks (dev default, keeps demo data + today stats)
 *   - "empty"       → mocks with an empty list (empty-state preview)
 *   - "0"           → real API: GET/POST/PATCH/DELETE /wards
 * Stats and routines are mock-only today — the backend does not expose them
 * yet, so in API mode they are simply absent (undefined).
 */

export type WardsMode = "mocks" | "empty" | "api"

export function getWardsMode(): WardsMode {
  const value = import.meta.env.VITE_USE_MOCKS
  if (value === "empty") return "empty"
  if (value === "0") return "api"
  return "mocks"
}

function toWardWithToday(ward: WardPublic): WardWithToday {
  return {
    id: ward.id,
    full_name: ward.full_name,
    phone_e164: ward.phone_e164,
    tz: ward.tz ?? "Europe/Warsaw",
    active: ward.active,
    // TODO(api): stats/routines land with a later backend task
  }
}

export async function fetchWards(): Promise<WardWithToday[]> {
  const mode = getWardsMode()

  if (mode === "api") {
    const { data } = await WardsService.readWards({ query: { limit: 500 } })
    return data.data.map(toWardWithToday)
  }

  const wards = await mockListWards()
  return mode === "empty" ? [] : wards
}

export async function fetchWard(id: string): Promise<WardWithToday> {
  const mode = getWardsMode()

  if (mode === "api") {
    const { data } = await WardsService.readWard({ path: { id } })
    return toWardWithToday(data)
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
