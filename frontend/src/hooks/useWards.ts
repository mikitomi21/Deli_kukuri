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
 * Ward hooks. The backend ships full wards CRUD since T05, so the
 * VITE_USE_MOCKS tag (optional, see frontend/.env.example) picks the source:
 *   - unset / "0" / "false" → real API (default): GET/POST/PATCH/DELETE /wards
 *   - "mocks" / "1" / "true" → in-memory mock store (demo data + today stats)
 *   - "empty"               → mocks with an empty list (empty-state preview)
 * Stats are mock-only today — the backend does not expose them yet, so in
 * API mode they are simply absent (undefined). Routines are fetched
 * separately, see src/hooks/useRoutines.ts.
 */

export type WardsMode = "mocks" | "empty" | "api"

export function getWardsMode(): WardsMode {
  const value = import.meta.env.VITE_USE_MOCKS?.trim().toLowerCase()
  if (value === "empty") return "empty"
  if (value === "mocks" || value === "1" || value === "true") return "mocks"
  return "api"
}

function toWardWithToday(ward: WardPublic): WardWithToday {
  return {
    id: ward.id,
    full_name: ward.full_name,
    phone_e164: ward.phone_e164,
    tz: ward.tz ?? "Europe/Warsaw",
    active: ward.active,
    // TODO(api): stats land with a later backend task (docs/05 SHOULD)
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
