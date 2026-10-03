import { afterEach, describe, expect, it, vi } from "vitest"
import { getWardsMode } from "./apiMode"

describe("API mode selection", () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each([undefined, "", "0", "false"])(
    "defaults to the API for %s",
    (value) => {
      vi.stubEnv("VITE_USE_MOCKS", value)
      expect(getWardsMode()).toBe("api")
    },
  )

  it.each(["mocks", "1", "true", " MOCKS "])(
    "explicitly selects demo data for %s",
    (value) => {
      vi.stubEnv("VITE_USE_MOCKS", value)
      expect(getWardsMode()).toBe("mocks")
    },
  )

  it("preserves the empty preview", () => {
    vi.stubEnv("VITE_USE_MOCKS", "empty")
    expect(getWardsMode()).toBe("empty")
  })
})
