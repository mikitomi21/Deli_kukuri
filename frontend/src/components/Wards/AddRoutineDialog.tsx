import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import {
  RoutineDialog,
  type RoutineFormPayload,
} from "@/components/Wards/RoutineDialog"
import useCustomToast from "@/hooks/useCustomToast"
import { addRoutine } from "@/hooks/useRoutines"
import { handleError } from "@/utils"

interface AddRoutineDialogProps {
  wardId: string
  children: React.ReactNode
  /** Controlled mode: dialog opens while `open` is true (e.g. ?addRoutine deep link). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** Creation entry point — reuses the step-by-step RoutineDialog. */
export function AddRoutineDialog({
  wardId,
  children,
  open,
  onOpenChange,
}: AddRoutineDialogProps) {
  const queryClient = useQueryClient()
  const { t } = useTranslation("wards")
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const mutation = useMutation({
    mutationFn: (payload: RoutineFormPayload) => addRoutine(wardId, payload),
    onSuccess: () => {
      showSuccessToast(t("addRoutine.successToast"))
      onOpenChange?.(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["wards"] })
      queryClient.invalidateQueries({ queryKey: ["ward", wardId] })
      queryClient.invalidateQueries({ queryKey: ["routines", wardId] })
      // the schedule derives from approved routines — refresh it too
      queryClient.invalidateQueries({ queryKey: ["call-tasks", wardId] })
    },
  })

  return (
    <RoutineDialog
      wardId={wardId}
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={(payload) => mutation.mutateAsync(payload)}
    >
      {children}
    </RoutineDialog>
  )
}
