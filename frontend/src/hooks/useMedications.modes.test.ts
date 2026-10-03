import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MedicationsService } from "@/client"
import { mockMedications } from "@/mocks/store"

import { fetchMedications, filterMedications } from "./useMedications"

describe("fetchMedications — mocks mode (default)", () => {
  beforeEach(() => vi.stubEnv("VITE_USE_MOCKS", "1"))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
  it("returns the test catalog without calling the API", async () => {
    const spy = vi.spyOn(MedicationsService, "readMedications")
    const result = await fetchMedications()

    expect(spy).not.toHaveBeenCalled()
    expect(result).toEqual(mockMedications)
    expect(result.length).toBeGreaterThan(0)

    spy.mockRestore()
  })
})

describe("fetchMedications — API mode (VITE_USE_MOCKS=0)", () => {
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

    vi.stubEnv("VITE_USE_MOCKS", "0")
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
