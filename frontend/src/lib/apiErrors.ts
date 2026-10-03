import { isAxiosError } from "axios"

export function isAuthenticationError(error: unknown): boolean {
  return isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)
}

export function retryApiQuery(failureCount: number, error: unknown): boolean {
  return !isAuthenticationError(error) && failureCount < 3
}

export function callStartErrorKey(error: unknown): string {
  const details: Record<string, string> = {
    "No approved routine found": "wardDetail.callErrors.noApprovedRoutine",
    "Routine has no medications": "wardDetail.callErrors.noMedications",
    "Ward is deactivated": "wardDetail.callErrors.wardInactive",
    "Voice provider is unavailable": "wardDetail.callErrors.serviceUnavailable",
    "Call queue is unavailable": "wardDetail.callErrors.queueUnavailable",
  }
  const detail = isAxiosError(error) ? error.response?.data?.detail : undefined
  return typeof detail === "string"
    ? (details[detail] ?? "wardDetail.callFailed")
    : "wardDetail.callFailed"
}
