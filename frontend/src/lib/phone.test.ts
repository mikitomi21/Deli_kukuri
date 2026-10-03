import { describe, expect, it } from "vitest"

import { isValidE164, normalizePhoneToE164 } from "./phone"

// Cases straight from docs/04-user-stories.md (B1)
describe("normalizePhoneToE164", () => {
  it("prepends the Polish country code for 9 digits", () => {
    expect(normalizePhoneToE164("600 100 200")).toBe("+48600100200")
    expect(normalizePhoneToE164("600100200")).toBe("+48600100200")
  })

  it("keeps a valid number that already has a country code", () => {
    expect(normalizePhoneToE164("+48600100200")).toBe("+48600100200")
  })

  it("prepends + to a country code without the plus", () => {
    expect(normalizePhoneToE164("48600100200")).toBe("+48600100200")
  })

  it("converts the 00 prefix to +", () => {
    expect(normalizePhoneToE164("0048600100200")).toBe("+48600100200")
  })

  it("strips separators and parentheses", () => {
    expect(normalizePhoneToE164("+48 (600) 100-200")).toBe("+48600100200")
  })
})

describe("isValidE164", () => {
  it("accepts normalized numbers", () => {
    expect(isValidE164("+48600100200")).toBe(true)
    expect(isValidE164("+441632960961")).toBe(true)
  })

  it("rejects too-short numbers and non-numeric input (docs/04 B1)", () => {
    expect(isValidE164(normalizePhoneToE164("600 100"))).toBe(false)
    expect(isValidE164(normalizePhoneToE164("abc"))).toBe(false)
    expect(isValidE164("600100200")).toBe(false) // bez plusa
  })
})
