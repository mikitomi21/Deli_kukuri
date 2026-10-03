export type WardsMode = "mocks" | "empty" | "api"

export function getWardsMode(): WardsMode {
  const value = import.meta.env.VITE_USE_MOCKS?.trim().toLowerCase()
  if (value === "empty") return "empty"
  if (value === "mocks" || value === "1" || value === "true") return "mocks"
  return "api"
}
