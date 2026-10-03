import { AxiosError } from "axios"
import i18n from "@/i18n"

/**
 * Backend error surfaces arrive as English `detail` strings or raw pydantic
 * 422 arrays. Users must never see those raw, so both shapes are mapped onto
 * i18n keys (common namespace). Anything unmapped falls back to the generic
 * message rather than leaking English internals.
 */

const DETAIL_KEY_MAP: Record<string, string> = {
  "Ward not found": "errors.wardNotFound",
  "Routine not found": "errors.routineNotFound",
  "Medication not found": "errors.medicationNotFound",
  "Routine cannot depend on itself": "errors.routineSelfDependency",
  "Incorrect email or password": "errors.invalidCredentials",
  "Inactive user": "errors.inactiveUser",
  "Invalid token": "errors.invalidToken",
  "Incorrect password": "errors.incorrectPassword",
  "New password cannot be the same as the current one": "errors.samePassword",
  "User not found": "errors.userNotFound",
  "The user with this email already exists in the system.":
    "errors.emailExists",
  "The user with this email already exists in the system": "errors.emailExists",
  "User with this email already exists": "errors.emailExists",
  "The user doesn't have enough privileges": "errors.notEnoughPermissions",
  "Not enough permissions": "errors.notEnoughPermissions",
  "Super users are not allowed to delete themselves":
    "errors.superuserDeleteSelf",
  "Item not found": "errors.itemNotFound",
  "The user with this username does not exist in the system.":
    "errors.userNotFound",
  "The user with this id does not exist in the system": "errors.userNotFound",
  "User with this id does not exist in the system": "errors.userNotFound",
  "Cannot approve a routine without medications": "errors.routineNoMedications",
  "Only approved routines can be paused": "errors.routinePauseApprovedOnly",
  // Mock store throws plain Polish errors; map them to the same keys
  "Ilość musi być liczbą, np. 1 albo 0,5": "errors.amountNumeric",
  "Nie znaleziono podopiecznego": "errors.wardNotFound",
  "Nie znaleziono rutyny": "errors.routineNotFound",
  "Nie znaleziono połączenia": "errors.callNotFound",
  "Nie można zatwierdzić rutyny bez leków": "errors.routineNoMedications",
  "Wymagana rutyna nie jest zatwierdzona":
    "errors.routineDependencyNotApprovedGeneric",
  "Podopieczny nie ma zatwierdzonej rutyny": "errors.testCallNoRoutine",
}

/** pydantic v2 error `type` → message key ({{field}} interpolated separately). */
const VALIDATION_TYPE_KEY_MAP: Record<string, string> = {
  missing: "errors.fieldRequired",
  string_too_short: "errors.fieldTooShort",
  string_too_long: "errors.fieldTooLong",
  string_pattern_mismatch: "errors.fieldInvalid",
  string_type: "errors.fieldInvalid",
  value_error: "errors.fieldInvalid",
  greater_than: "errors.fieldInvalid",
  less_than: "errors.fieldInvalid",
}

/** API field names → localized labels (common.errors fields live under `fields`). */
const FIELD_KEY_MAP: Record<string, string> = {
  full_name: "fields.fullName",
  phone_e164: "fields.phone",
  tz: "fields.timezone",
  email: "fields.email",
  password: "fields.password",
  new_password: "fields.newPassword",
  current_password: "fields.currentPassword",
  name: "fields.name",
  time_of_day: "fields.time",
  days: "fields.days",
  amount_label: "fields.amount",
}

function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(`common:${key}`, options) as string
}

function fieldLabel(field: unknown): string {
  if (typeof field === "string" && FIELD_KEY_MAP[field]) {
    return t(FIELD_KEY_MAP[field])
  }
  return typeof field === "string" ? field : t("errors.genericField")
}

function validationDetailMessage(detail: Record<string, unknown>): string {
  const type = String(detail.type ?? "")
  const messageKey = VALIDATION_TYPE_KEY_MAP[type]
  const loc = detail.loc as unknown[] | undefined
  const lastLoc = loc?.length ? loc[loc.length - 1] : undefined
  if (!messageKey) {
    return t("errors.fieldInvalid", { field: fieldLabel(lastLoc) })
  }
  const field = fieldLabel(lastLoc)
  if (
    messageKey === "errors.fieldTooShort" ||
    messageKey === "errors.fieldTooLong"
  ) {
    const limit = (detail as { ctx?: { min?: number; max?: number } }).ctx
    const limitValue = limit?.min ?? limit?.max
    if (limitValue !== undefined) {
      return t(messageKey, { field, limit: limitValue })
    }
  }
  return t(messageKey, { field })
}

function extractErrorMessage(err: Error): string {
  if (err instanceof AxiosError) {
    const errDetail = (err.response?.data as any)?.detail
    if (Array.isArray(errDetail) && errDetail.length > 0) {
      const messages = errDetail.map((item) =>
        typeof item === "object" && item !== null
          ? validationDetailMessage(item)
          : t("errors.generic"),
      )
      return Array.from(new Set(messages)).join(" ")
    }
    if (typeof errDetail === "string") {
      const mappedKey = DETAIL_KEY_MAP[errDetail]
      if (mappedKey) return t(mappedKey)
      // Field lists ("Fields cannot be null: a, b") — localized wrapper
      if (errDetail.startsWith("Fields cannot be null")) {
        return t("errors.nullFields")
      }
      // Dependent routine name is interpolated by the backend
      const dependencyMatch =
        /^Cannot approve: required routine '(.+)' is not approved$/.exec(
          errDetail,
        )
      if (dependencyMatch) {
        return t("errors.routineDependencyNotApproved", {
          name: dependencyMatch[1],
        })
      }
      return t("errors.generic")
    }
  }
  return t("errors.generic")
}

export const handleError = function (this: (msg: string) => void, err: Error) {
  const errorMessage = extractErrorMessage(err)
  this(errorMessage)
}

export const getInitials = (name: string): string => {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
}
