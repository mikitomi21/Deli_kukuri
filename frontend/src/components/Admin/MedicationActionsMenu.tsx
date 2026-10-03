import { EllipsisVertical } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import type { MedicationPublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import DeleteMedication from "./DeleteMedication"
import EditMedication from "./EditMedication"

interface MedicationActionsMenuProps {
  medication: MedicationPublic
}

export const MedicationActionsMenu = ({
  medication,
}: MedicationActionsMenuProps) => {
  const { t } = useTranslation("admin")
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("medicationActions.openMenu")}
        >
          <EllipsisVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <EditMedication
          medication={medication}
          onSuccess={() => setOpen(false)}
        />
        <DeleteMedication
          medication={medication}
          onSuccess={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
