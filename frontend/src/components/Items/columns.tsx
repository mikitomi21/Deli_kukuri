import type { ColumnDef } from "@tanstack/react-table"
import { Check, Copy } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { ItemPublic } from "@/client"
import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import i18n from "@/i18n"
import { cn } from "@/lib/utils"
import { ItemActionsMenu } from "./ItemActionsMenu"

function CopyId({ id }: { id: string }) {
  const { t } = useTranslation("items")
  const [copiedText, copy] = useCopyToClipboard()
  const isCopied = copiedText === id

  return (
    <div className="flex items-center gap-1.5 group">
      <span className="font-mono text-xs text-muted-foreground">{id}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => copy(id)}
      >
        {isCopied ? (
          <Check className="size-3 text-green-500" aria-hidden="true" />
        ) : (
          <Copy className="size-3" aria-hidden="true" />
        )}
        <span className="sr-only">{t("table.copyId")}</span>
      </Button>
    </div>
  )
}

function DescriptionCell({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation("items")

  return (
    <span
      className={cn(
        "max-w-xs truncate block text-muted-foreground",
        !value && "italic",
      )}
    >
      {value || t("table.noDescription")}
    </span>
  )
}

export const columns: ColumnDef<ItemPublic>[] = [
  {
    accessorKey: "id",
    header: i18n.t("items:table.id"),
    cell: ({ row }) => <CopyId id={row.original.id} />,
  },
  {
    accessorKey: "title",
    header: i18n.t("items:table.title"),
    cell: ({ row }) => (
      <span className="font-medium">{row.original.title}</span>
    ),
  },
  {
    accessorKey: "description",
    header: i18n.t("items:table.description"),
    cell: ({ row }) => <DescriptionCell value={row.original.description} />,
  },
  {
    id: "actions",
    header: () => (
      <span className="sr-only">{i18n.t("items:table.actions")}</span>
    ),
    cell: ({ row }) => (
      <div className="flex justify-end">
        <ItemActionsMenu item={row.original} />
      </div>
    ),
  },
]
