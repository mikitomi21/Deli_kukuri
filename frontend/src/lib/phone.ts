/**
 * Normalizuje numer telefonu do E.164 z polskim domyślnym kierunkowym (+48).
 *
 * Akceptuje formaty: "600 100 200", "+48 600 100 200", "48600100200",
 * "+48-600-100-200". Zwraca `null`, gdy numer jest niemożliwy — za krótki,
 * za długi albo zawiera litery (kryterium B1 w docs/04-user-stories.md).
 */
export function normalizePhoneToE164(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, "")
  const national = digits.replace(/^\+?48/, "")
  // 9 cyfr, pierwsza 2-9 (mobile 5-8, stacjonarne zaczynają się od 12-46).
  return /^[2-9]\d{8}$/.test(national) ? `+48${national}` : null
}
