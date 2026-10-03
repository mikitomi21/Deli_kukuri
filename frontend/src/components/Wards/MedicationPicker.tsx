import { useQuery } from "@tanstack/react-query"
import { Pill, Plus, Search, X } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type CatalogMedication,
  filterMedications,
  medicationsQueryOptions,
} from "@/hooks/useMedications"
import type { RoutineItem } from "@/types/dashboard"

interface MedicationPickerProps {
  /** Selected routine items (medication + amount label). */
  value: RoutineItem[]
  onChange: (items: RoutineItem[]) => void
}

/**
 * Medication picker over the shared catalog (read-only, docs/04 C1).
 * The list stays short on purpose: search first, pick, then enter the
 * amount inline. Medications are never created here — only picked.
 */
export function MedicationPicker({ value, onChange }: MedicationPickerProps) {
  const { t } = useTranslation("wards")
  const [query, setQuery] = useState("")
  const { isPending, data: medications } = useQuery(
    medicationsQueryOptions(query),
  )

  const results = useMemo(
    () => filterMedications(medications ?? [], query).slice(0, 6),
    [medications, query],
  )

  const selectedIds = new Set(value.map((item) => item.medication_id))

  const addMedication = (medication: CatalogMedication) => {
    if (selectedIds.has(medication.id)) {
      return
    }
    onChange([
      ...value,
      {
        medication_id: medication.id,
        medication_name: medication.name,
        dosage: medication.dosage,
        amount_label: "",
      },
    ])
    setQuery("")
  }

  const removeMedication = (medicationId: string) => {
    onChange(value.filter((item) => item.medication_id !== medicationId))
  }

  return (
    <div className="grid gap-4">
      {value.length > 0 && (
        <ul
          className="grid gap-2"
          aria-label={t("medicationPicker.selectedAria")}
        >
          {value.map((item) => (
            <li
              key={item.medication_id}
              className="flex items-center gap-3 rounded-md border px-3 py-2"
            >
              <Pill
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">
                {item.medication_name}{" "}
                <span className="text-muted-foreground">{item.dosage}</span>
              </p>
              <Input
                placeholder={t("medicationPicker.amountPlaceholder")}
                className="h-8 w-36 text-xs"
                value={item.amount_label}
                onChange={(event) =>
                  onChange(
                    value.map((v) =>
                      v.medication_id === item.medication_id
                        ? { ...v, amount_label: event.target.value }
                        : v,
                    ),
                  )
                }
                aria-label={t("medicationPicker.amountFor", {
                  name: item.medication_name,
                })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => removeMedication(item.medication_id)}
                aria-label={t("medicationPicker.removeFor", {
                  name: item.medication_name,
                })}
              >
                <X aria-hidden className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2">
        <div className="relative">
          <Search
            aria-hidden
            className="absolute top-2.5 left-2.5 size-4 text-muted-foreground"
          />
          <Input
            placeholder={t("medicationPicker.searchPlaceholder")}
            className="pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("medicationPicker.searchAria")}
          />
        </div>

        {isPending ? (
          <div
            className="grid gap-1"
            role="status"
            aria-busy="true"
            aria-label={t("medicationPicker.loadingAria")}
          >
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : results.length > 0 ? (
          <ul className="grid gap-1">
            {results.map((medication) => (
              <li key={medication.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-60"
                  onClick={() => addMedication(medication)}
                  disabled={selectedIds.has(medication.id)}
                >
                  <span className="truncate">
                    {medication.name}{" "}
                    <span className="text-muted-foreground">
                      {medication.dosage}
                    </span>
                  </span>
                  <Plus
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("medicationPicker.emptyCatalog")}
          </p>
        )}
      </div>
    </div>
  )
}
