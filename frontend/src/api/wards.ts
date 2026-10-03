// Ręcznie pisany endpoint — do czasu, aż backend wystawi /wards (T05) i klient
// openapi-ts zostanie zregenerowany. Kontrakt: docs/05-api-spec.md (POST /wards).

import type { HTTPValidationError } from "@/client"
import { client } from "@/client/client.gen"

export type WardCreate = {
  full_name: string
  phone_e164: string
  tz: string
}

export type WardPublic = WardCreate & {
  id: string
  caregiver_id: string
  active: boolean
}

export function createWard(options: {
  body: WardCreate
  headers?: Record<string, string>
}) {
  return client.post<{ 200: WardPublic }, { 422: HTTPValidationError }, true>({
    responseType: "json",
    security: [{ scheme: "bearer", type: "http" }],
    url: "/api/v1/wards",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })
}
