import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react"
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
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import useCustomToast from "@/hooks/useCustomToast"
import {
  approveRoutine,
  pauseRoutine,
  removeRoutine,
  saveRoutine,
} from "@/hooks/useRoutines"
import type { Routine } from "@/types/dashboard"
import { handleError } from "@/utils"

import { RoutineDialog } from "./RoutineDialog"

interface RoutineActionsMenuProps {
  routine: Routine
}

/** Actions per docs/04 C3/C4: edit (→ draft), approve, pause/resume, delete (draft only). */
export function RoutineActionsMenu({ routine }: RoutineActionsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const queryClient = useQueryClient()
  const { t } = useTranslation("wards")
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["wards"] })
    queryClient.invalidateQueries({ queryKey: ["ward", routine.ward_id] })
    queryClient.invalidateQueries({ queryKey: ["routines", routine.ward_id] })
  }

  const approve = useMutation({
    mutationFn: () => approveRoutine(routine.id),
    onSuccess: () => {
      showSuccessToast(t("routineActions.approvedToast"))
      invalidate()
    },
    onError: handleError.bind(showErrorToast),
  })

  const togglePause = useMutation({
    mutationFn: () => pauseRoutine(routine.id, routine.status !== "paused"),
    onSuccess: () => {
      showSuccessToast(
        routine.status === "paused"
          ? t("routineActions.resumedToast")
          : t("routineActions.pausedToast"),
      )
      invalidate()
    },
    onError: handleError.bind(showErrorToast),
  })

  const remove = useMutation({
    mutationFn: () => removeRoutine(routine.id),
    onSuccess: () => {
      showSuccessToast(t("routineActions.removedToast"))
      invalidate()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => setDeleteOpen(false),
  })

  /** Editing keeps the same payload contract as creation. */
  const save = useMutation({
    mutationFn: (payload: Parameters<typeof saveRoutine>[1]) =>
      saveRoutine(routine.id, payload),
    onSuccess: () => {
      showSuccessToast(t("routineActions.savedToast"))
      invalidate()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => setEditOpen(false),
  })

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t("routineActions.actionsFor", { name: routine.name })}
          >
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              setMenuOpen(false)
              setEditOpen(true)
            }}
          >
            <Pencil aria-hidden />
            {t("routineActions.edit")}
          </DropdownMenuItem>
          {routine.status === "draft" && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                approve.mutate()
              }}
            >
              <CheckCircle2 aria-hidden />
              {t("routineActions.approve")}
            </DropdownMenuItem>
          )}
          {routine.status !== "draft" && (
            <DropdownMenuItem onSelect={() => togglePause.mutate()}>
              {routine.status === "paused" ? (
                <>
                  <Play aria-hidden />
                  {t("routineActions.resume")}
                </>
              ) : (
                <>
                  <Pause aria-hidden />
                  {t("routineActions.pause")}
                </>
              )}
            </DropdownMenuItem>
          )}
          {routine.status === "draft" && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={(event) => {
                event.preventDefault()
                setMenuOpen(false)
                setDeleteOpen(true)
              }}
            >
              <Trash2 aria-hidden />
              {t("routineActions.delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <RoutineDialog
        wardId={routine.ward_id}
        routine={routine}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={(payload) => save.mutateAsync(payload)}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("routineActions.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("routineActions.deleteDescription", { name: routine.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={remove.isPending}>
                {t("routineActions.cancel")}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {t("routineActions.deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
