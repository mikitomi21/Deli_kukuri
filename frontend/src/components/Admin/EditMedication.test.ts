import { describe, expect, it } from "vitest"
import en from "@/i18n/locales/en/admin.json"
import pl from "@/i18n/locales/pl/admin.json"
import { createMedicationSchema } from "./EditMedication"

describe.each([en, pl])("medication form translations", (locale) => {
  const messages = locale.medicationActions.validation
  const schema = createMedicationSchema(
    (key) => messages[key.split(".").at(-1) as keyof typeof messages],
  )

  it("localizes required field errors", () => {
    const result = schema.safeParse({ name: "", dosage: "" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        messages.nameRequired,
        messages.dosageRequired,
      ])
    }
  })

  it("localizes optional field length errors", () => {
    const result = schema.safeParse({
      name: "Medication",
      dosage: "5 mg",
      form: "x".repeat(101),
      instructions: "x".repeat(256),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        messages.formTooLong,
        messages.instructionsTooLong,
      ])
    }
  })

  it("accepts a valid medication", () => {
    expect(
      schema.safeParse({ name: "Medication", dosage: "5 mg" }).success,
    ).toBe(true)
  })
})
