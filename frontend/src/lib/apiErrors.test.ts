import { AxiosError } from "axios"
import { describe, expect, it } from "vitest"
import {
  callStartErrorKey,
  isAuthenticationError,
  retryApiQuery,
} from "./apiErrors"

function responseError(status: number): AxiosError {
  return new AxiosError("Request failed", undefined, undefined, undefined, {
    status,
  } as never)
}

describe("API query retries", () => {
  it.each([401, 403])("does not retry authentication status %s", (status) => {
    const error = responseError(status)
    expect(isAuthenticationError(error)).toBe(true)
    expect(retryApiQuery(0, error)).toBe(false)
  })

  it.each([404, 500])("preserves bounded retries for status %s", (status) => {
    const error = responseError(status)
    expect(isAuthenticationError(error)).toBe(false)
    expect(retryApiQuery(0, error)).toBe(true)
    expect(retryApiQuery(3, error)).toBe(false)
  })

  it("retries network errors without treating them as expired sessions", () => {
    const error = new Error("Network unavailable")
    expect(isAuthenticationError(error)).toBe(false)
    expect(retryApiQuery(0, error)).toBe(true)
    expect(retryApiQuery(3, error)).toBe(false)
  })
})

describe("call start errors", () => {
  it.each([
    ["No approved routine found", "noApprovedRoutine"],
    ["Routine has no medications", "noMedications"],
    ["Ward is deactivated", "wardInactive"],
    ["Voice provider is unavailable", "serviceUnavailable"],
    ["Call queue is unavailable", "queueUnavailable"],
  ])("maps %s to a translated actionable message", (detail, key) => {
    const error = responseError(409)
    error.response!.data = { detail }
    expect(callStartErrorKey(error)).toBe(`wardDetail.callErrors.${key}`)
  })

  it("uses the generic translation for unexpected errors", () => {
    expect(callStartErrorKey(new Error("Network error"))).toBe(
      "wardDetail.callFailed",
    )
    const error = responseError(500)
    error.response!.data = { detail: [{ msg: "Unexpected validation" }] }
    expect(callStartErrorKey(error)).toBe("wardDetail.callFailed")
  })
})
