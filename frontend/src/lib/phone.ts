/**
 * Normalizacja numeru telefonu do E.164 z polskim defaultem (+48),
 * zgodnie z docs/04-user-stories.md (B1) i docs/05-api-spec.md.
 */

/** Strips separators and normalizes a phone number to E.164 (Polish +48 default). */
export function normalizePhoneToE164(input: string): string {
  const cleaned = input.replace(/[\s\-().]/g, "")

  if (cleaned.startsWith("00")) {
    return `+${cleaned.slice(2)}`
  }
  if (cleaned.startsWith("+")) {
    return cleaned
  }
  // 9 digits without country code → Polish number
  if (/^\d{9}$/.test(cleaned)) {
    return `+48${cleaned}`
  }
  // 11 digits starting with 48 → Polish country code without the plus
  if (/^48\d{9}$/.test(cleaned)) {
    return `+${cleaned}`
  }
  return cleaned
}

/** E.164 validation (Polish default: +48 followed by 9 digits). */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone)
}
