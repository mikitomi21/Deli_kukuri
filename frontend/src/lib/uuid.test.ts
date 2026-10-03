import { afterEach, expect, it, vi } from "vitest"
import { createUuid } from "./uuid"

afterEach(() => vi.unstubAllGlobals())

it("generates a valid UUID when randomUUID is unavailable on an HTTP host", () => {
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index))
      return bytes
    },
  })
  expect(createUuid()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f")
})
