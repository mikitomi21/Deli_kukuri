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
}

/** Creation entry point — reuses the step-by-step RoutineDialog (uncontrolled, trigger = children). */
export function AddRoutineDialog({ wardId, children }: AddRoutineDialogProps) {
  const queryClient = useQueryClient()
  const { t } = useTranslation("wards")
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const mutation = useMutation({
    mutationFn: (payload: RoutineFormPayload) => addRoutine(wardId, payload),
    onSuccess: () => {
      showSuccessToast(t("addRoutine.successToast"))
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["wards"] })
      queryClient.invalidateQueries({ queryKey: ["ward", wardId] })
      queryClient.invalidateQueries({ queryKey: ["routines", wardId] })
    },
  })

  return (
    <RoutineDialog
      wardId={wardId}
      onSubmit={(payload) => mutation.mutateAsync(payload)}
    >
      {children}
    </RoutineDialog>
  )
}
