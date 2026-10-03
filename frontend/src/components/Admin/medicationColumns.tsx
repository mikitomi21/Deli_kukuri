import type { ColumnDef } from "@tanstack/react-table"

import type { MedicationPublic } from "@/client"
import { cn } from "@/lib/utils"

export const medicationColumns: ColumnDef<MedicationPublic>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "dosage",
    header: "Dosage",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.dosage}</span>
    ),
  },
  {
    accessorKey: "form",
    header: "Form",
    cell: ({ row }) => (
      <span
        className={cn(
          "text-muted-foreground",
          !row.original.form && "italic opacity-50",
        )}
      >
        {row.original.form || "—"}
      </span>
    ),
  },
  {
    accessorKey: "instructions",
    header: "Instructions",
    cell: ({ row }) => (
      <span
        className={cn(
          "text-muted-foreground",
          !row.original.instructions && "italic opacity-50",
        )}
      >
        {row.original.instructions || "—"}
      </span>
    ),
  },
]
