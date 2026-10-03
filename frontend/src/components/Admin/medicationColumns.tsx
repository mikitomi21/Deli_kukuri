import type { ColumnDef } from "@tanstack/react-table"

import type { MedicationPublic } from "@/client"
import i18n from "@/i18n"
import { MedicationActionsMenu } from "./MedicationActionsMenu"

// Column definitions live outside components: use a fixed-t translator
// bound to the admin namespace for headers.
const t = i18n.getFixedT(null, "admin")

export const medicationColumns: ColumnDef<MedicationPublic>[] = [
  {
    accessorKey: "name",
    header: t("medicationColumns.name"),
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "dosage",
    header: t("medicationColumns.dosage"),
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.dosage}</span>
    ),
  },
  {
    accessorKey: "form",
    header: t("medicationColumns.form"),
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.form ?? "—"}</span>
    ),
  },
  {
    accessorKey: "instructions",
    header: t("medicationColumns.instructions"),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.instructions ?? "—"}
      </span>
    ),
  },
  {
    id: "actions",
    header: () => (
      <span className="sr-only">{t("medicationActions.actions")}</span>
    ),
    cell: ({ row }) => (
      <div className="flex justify-end">
        <MedicationActionsMenu medication={row.original} />
      </div>
    ),
  },
]
