import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
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
} from "@/components/ui/dialog"
import useCustomToast from "@/hooks/useCustomToast"
import { removeWard } from "@/hooks/useWards"
import type { WardWithToday } from "@/types/dashboard"
import { handleError } from "@/utils"

interface WardDeactivateDialogProps {
  ward: WardWithToday
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Soft delete per docs/04 B2: gone from the dashboard, history preserved. */
export function WardDeactivateDialog({
  ward,
  open,
  onOpenChange,
}: WardDeactivateDialogProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation("wards")
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const mutation = useMutation({
    mutationFn: () => removeWard(ward.id),
    onSuccess: () => {
      showSuccessToast(t("wardDeactivate.successToast"))
      onOpenChange(false)
      navigate({ to: "/" })
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["wards"] })
      queryClient.invalidateQueries({ queryKey: ["ward", ward.id] })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("wardDeactivate.title")}</DialogTitle>
          <DialogDescription>
            {t("wardDeactivate.description", { name: ward.full_name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={mutation.isPending}>
              {t("wardDeactivate.cancel")}
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {t("wardDeactivate.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
