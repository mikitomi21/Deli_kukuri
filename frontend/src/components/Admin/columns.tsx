import type { ColumnDef } from "@tanstack/react-table"

import type { UserPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import i18n from "@/i18n"
import { cn } from "@/lib/utils"
import { UserActionsMenu } from "./UserActionsMenu"

export type UserTableData = UserPublic & {
  isCurrentUser: boolean
}

// Column definitions live outside components: use a fixed-t translator
// bound to the admin namespace for headers and cell content.
const t = i18n.getFixedT(null, "admin")

export const columns: ColumnDef<UserTableData>[] = [
  {
    accessorKey: "full_name",
    header: t("columns.fullName"),
    cell: ({ row }) => {
      const fullName = row.original.full_name
      return (
        <div className="flex items-center gap-2">
          <span
            className={cn("font-medium", !fullName && "text-muted-foreground")}
          >
            {fullName || t("columns.fullNameFallback")}
          </span>
          {row.original.isCurrentUser && (
            <Badge variant="outline" className="text-xs">
              {t("columns.you")}
            </Badge>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: "email",
    header: t("columns.email"),
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.email}</span>
    ),
  },
  {
    accessorKey: "is_superuser",
    header: t("columns.role"),
    cell: ({ row }) => (
      <Badge variant={row.original.is_superuser ? "default" : "secondary"}>
        {row.original.is_superuser
          ? t("columns.roleSuperuser")
          : t("columns.roleUser")}
      </Badge>
    ),
  },
  {
    accessorKey: "is_active",
    header: t("columns.status"),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 rounded-full",
            row.original.is_active ? "bg-success" : "bg-muted-foreground/40",
          )}
          aria-hidden
        />
        <span className={row.original.is_active ? "" : "text-muted-foreground"}>
          {row.original.is_active
            ? t("columns.statusActive")
            : t("columns.statusInactive")}
        </span>
      </div>
    ),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">{t("columns.actions")}</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <UserActionsMenu user={row.original} />
      </div>
    ),
  },
]
