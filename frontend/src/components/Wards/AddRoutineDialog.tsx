import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
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
  /** Optional trigger — omitted in controlled mode (e.g. ward details). */
  children?: React.ReactNode
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
  const navigate = useNavigate()
  const { t } = useTranslation("wards")
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const mutation = useMutation({
    mutationFn: (payload: RoutineFormPayload) => addRoutine(wardId, payload),
    onSuccess: () => {
      showSuccessToast(t("addRoutine.successToast"))
      onOpenChange?.(false)
      // Every entry point (dashboard deep link included) lands on the ward
      // details so the new routine is immediately visible.
      navigate({ to: "/wards/$wardId", params: { wardId } })
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
