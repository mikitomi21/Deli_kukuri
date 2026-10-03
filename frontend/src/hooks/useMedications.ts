import { type MedicationPublic, MedicationsService } from "@/client"
import { getWardsMode } from "@/hooks/useWards"
import { mockMedications } from "@/mocks/store"

/**
 * Medication catalog (read-only, shared — docs/05-api-spec.md).
 * The tag VITE_USE_MOCKS picks the source:
 *   - mocks (default) → test catalog from src/mocks/store.ts
 *   - "0" (API)       → GET /api/v1/medications?q= (ILIKE search, shipped in T05)
 */

export type CatalogMedication = Pick<
  MedicationPublic,
  "id" | "name" | "dosage"
> & {
  form?: string | null
  instructions?: string | null
}

export async function fetchMedications(
  query?: string,
): Promise<CatalogMedication[]> {
  if (getWardsMode() === "api") {
    const { data } = await MedicationsService.readMedications({
      query: { q: query || undefined, limit: 50 },
    })
    return data.data
  }
  return mockMedications
}

export function medicationsQueryOptions(query: string) {
  return {
    queryKey: ["medications", "catalog", query],
    queryFn: () => fetchMedications(query),
  }
}

/** Client-side fallback filter for mocks mode (the mock catalog is small). */
export function filterMedications(
  medications: CatalogMedication[],
  query: string,
): CatalogMedication[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    return medications
  }
  return medications.filter((m) => m.name.toLowerCase().includes(q))
}
