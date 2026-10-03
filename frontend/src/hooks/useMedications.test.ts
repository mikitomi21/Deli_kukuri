import { beforeEach, describe, expect, it } from "vitest"

import { mockMedications } from "@/mocks/store"

import { filterMedications } from "./useMedications"

describe("filterMedications", () => {
  const medications = mockMedications

  beforeEach(() => {
    expect(medications.length).toBeGreaterThan(0)
  })

  it("empty query returns the whole catalog", () => {
    expect(filterMedications(medications, "")).toEqual(medications)
    expect(filterMedications(medications, "   ")).toEqual(medications)
  })

  it('matches a name fragment, like docs/04 C1 ("warf" -> Warfarin)', () => {
    const results = filterMedications(medications, "warf")
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("Warfarin")
  })

  it("ignores case and surrounding whitespace", () => {
    expect(filterMedications(medications, "  WARF ")).toHaveLength(1)
  })

  it('no match returns an empty list ("no such medication" state)', () => {
    expect(filterMedications(medications, "apap")).toEqual([])
  })

  it("handles Polish diacritics in names", () => {
    const withPolish = [{ id: "1", name: "Żelazo", dosage: "100 mg" }]
    expect(filterMedications(withPolish, "ŻEL")).toHaveLength(1)
  })
})
