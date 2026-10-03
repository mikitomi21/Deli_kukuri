export type WardsMode = "mocks" | "empty" | "api"

export function getWardsMode(): WardsMode {
  const value = import.meta.env.VITE_USE_MOCKS
  if (value === "empty") return "empty"
  return value === "0" ? "api" : "mocks"
}
