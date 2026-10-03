import { describe, expect, it, vi } from "vitest"

import { MedicationsService } from "@/client"
import { mockMedications } from "@/mocks/store"

import { fetchMedications, filterMedications } from "./useMedications"

describe("fetchMedications — mocks mode (VITE_USE_MOCKS=mocks)", () => {
  it("returns the test catalog without calling the API", async () => {
    // Pin the mode so the test does not depend on the real frontend/.env
    vi.stubEnv("VITE_USE_MOCKS", "1")
    const spy = vi.spyOn(MedicationsService, "readMedications")
    try {
      const result = await fetchMedications()

      expect(spy).not.toHaveBeenCalled()
      expect(result).toEqual(mockMedications)
      expect(result.length).toBeGreaterThan(0)
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})

describe("fetchMedications — API mode (default, no env needed)", () => {
  it("calls the real GET /medications endpoint", async () => {
    const fake: Array<{ id: string; name: string; dosage: string }> = [
      { id: "uuid-1", name: "Warfarin", dosage: "5 mg" },
    ]
    const spy = vi
      .spyOn(MedicationsService, "readMedications")
      .mockResolvedValue({
        data: { data: fake, count: fake.length },
        error: undefined,
        response: new Response(),
      } as never)

    // unset env = API mode (the new default)
    vi.stubEnv("VITE_USE_MOCKS", "")
    try {
      const result = await fetchMedications()
      expect(spy).toHaveBeenCalledOnce()
      expect(result).toEqual(fake)
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})

describe("catalog consistency", () => {
  it("filterMedications finds every catalog medication by full name", () => {
    for (const med of mockMedications) {
      expect(filterMedications(mockMedications, med.name)).toContainEqual(med)
    }
  })
})
