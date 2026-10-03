import { Info } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/**
 * The catalog is read-only and shared in MVP (docs/04 C1) — the backend
 * exposes no create endpoint, so this is an explainer instead of a form.
 * Seeding is done by the backend script (backend/app/seed.py).
 */
const AddMedication = () => {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useTranslation("admin")

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Info aria-hidden />
          {t("addMedication.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addMedication.title")}</DialogTitle>
          <DialogDescription>
            {t("addMedication.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("addMedication.close")}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AddMedication
