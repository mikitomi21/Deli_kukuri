import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Pill } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import { MedicationPicker } from "@/components/Wards/MedicationPicker"
import { fetchRoutines } from "@/hooks/useRoutines"
import { cn } from "@/lib/utils"
import type { Routine, RoutineItem } from "@/types/dashboard"

export interface RoutineFormPayload {
  name: string
  time_of_day: string
  items: RoutineItem[]
  depends_on: string[]
}

interface RoutineDialogProps {
  wardId: string
  /** When set, the dialog edits this routine instead of creating a new one. */
  routine?: Routine
  /** Controlled mode: pass open/onOpenChange. Otherwise children act as the trigger. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
  /** Called on the last step; rejects keep the dialog open. */
  onSubmit: (payload: RoutineFormPayload) => Promise<unknown>
  /** Called after a successful submit; closes an uncontrolled dialog. */
  onSuccess?: () => void
}

const STEPS = ["basics", "medications", "summary"] as const

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Step-by-step routine wizard (docs/04 C2): basics → medications → review.
 * One concern per step keeps the medication list readable; each step
 * validates before moving on, so errors never pile up at the end.
 * The form body is a separate component so every open starts from a fresh
 * mount — no reset effects racing with typed input.
 */
export function RoutineDialog({
  wardId,
  routine,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  children,
  onSubmit,
  onSuccess,
}: RoutineDialogProps) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const onOpenChange = onOpenChangeProp ?? setOpenState

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {openProp === undefined && children && (
        <DialogTrigger asChild>{children}</DialogTrigger>
      )}
      {open && (
        <DialogContent className="sm:max-w-lg">
          <RoutineFormBody
            wardId={wardId}
            routine={routine}
            onSubmit={onSubmit}
            onSuccess={() => {
              onSuccess?.()
              if (openProp === undefined) {
                setOpenState(false)
              }
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}

function RoutineFormBody({
  wardId,
  routine,
  onSubmit,
  onSuccess,
}: {
  wardId: string
  routine?: Routine
  onSubmit: (payload: RoutineFormPayload) => Promise<unknown>
  onSuccess?: () => void
}) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [timeOfDay, setTimeOfDay] = useState("")
  const [items, setItems] = useState<RoutineItem[]>([])
  const [dependsOn, setDependsOn] = useState<string[]>([])
  const [stepError, setStepError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { t } = useTranslation("wards")
  const stepLabels = STEPS.map((key) => t(`routineDialog.steps.${key}`))

  const { data: otherRoutines } = useQuery({
    queryKey: ["routines", wardId],
    queryFn: () => fetchRoutines(wardId),
  })

  const validateStep = (target: number): string | null => {
    if (target > 0 && step === 0) {
      if (!name.trim()) return t("routineDialog.errors.nameRequired")
      if (name.length > 100) return t("routineDialog.errors.nameMaxLength")
      if (!TIME_PATTERN.test(timeOfDay))
        return t("routineDialog.errors.timeFormat")
    }
    if (target > 1 && step === 1) {
      if (items.length === 0) return t("routineDialog.errors.noMedications")
      if (items.some((item) => item.amount_label.trim() === "")) {
        return t("routineDialog.errors.amountRequired")
      }
    }
    return null
  }

  const goTo = (target: number) => {
    if (target > step) {
      const error = validateStep(target)
      if (error) {
        setStepError(error)
        return
      }
    }
    setStepError(null)
    setStep(target)
  }

  const handleSubmit = async () => {
    for (const target of [1, 2]) {
      const error = validateStep(target)
      if (error) {
        setStepError(error)
        setStep(target - 1)
        return
      }
    }
    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        time_of_day: timeOfDay,
        items,
        depends_on: dependsOn,
      })
      onSuccess?.()
    } finally {
      setSubmitting(false)
    }
  }

  const timeInvalid =
    stepError !== null && step === 0 && !TIME_PATTERN.test(timeOfDay)

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {routine ? t("routineDialog.editTitle") : t("routineDialog.addTitle")}
        </DialogTitle>
        <DialogDescription>
          {routine
            ? t("routineDialog.editDescription")
            : t("routineDialog.addDescription")}
        </DialogDescription>
      </DialogHeader>

      {/* Step indicator — current step is exposed to assistive tech */}
      <ol
        className="flex items-center gap-2 py-2"
        aria-label={t("routineDialog.progressLabel")}
      >
        {stepLabels.map((label, index) => (
          <li
            key={label}
            className="flex flex-1 items-center gap-2"
            aria-current={index === step ? "step" : undefined}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                index < step &&
                  "border-primary bg-primary text-primary-foreground",
                index === step && "border-primary text-primary",
                index > step && "border-border text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
            <span
              className={cn(
                "text-xs",
                index === step
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div className="min-h-[16rem]">
        {step === 0 && (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="routine-name">
                {t("routineDialog.nameLabel")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="routine-name"
                placeholder={t("routineDialog.namePlaceholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                aria-invalid={Boolean(stepError && step === 0 && !name.trim())}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="routine-time">
                {t("routineDialog.timeLabel")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="routine-time"
                type="time"
                value={timeOfDay}
                onChange={(event) => setTimeOfDay(event.target.value)}
                aria-invalid={timeInvalid}
              />
              <p className="text-xs text-muted-foreground">
                {t("routineDialog.timeHint")}
              </p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-2">
            <p className="text-sm">
              <Label>{t("routineDialog.pickMeds")}</Label>
            </p>
            <MedicationPicker value={items} onChange={setItems} />
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4">
            <dl className="grid gap-1 rounded-md border p-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  {t("routineDialog.reviewName")}
                </dt>
                <dd className="font-medium">{name || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  {t("routineDialog.reviewTime")}
                </dt>
                <dd className="font-mono">{timeOfDay || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  {t("routineDialog.reviewMeds")}
                </dt>
                <dd className="text-right">
                  {items.length === 0
                    ? "—"
                    : items.map((item) => (
                        <span key={item.medication_id} className="block">
                          {item.medication_name} {item.dosage} —{" "}
                          {item.amount_label}
                        </span>
                      ))}
                </dd>
              </div>
            </dl>
            {otherRoutines && otherRoutines.length > 0 && (
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">
                  {t("routineDialog.dependsLabel")}
                </legend>
                {otherRoutines
                  .filter((other) => other.id !== routine?.id)
                  .map((other) => (
                    <div
                      key={other.id}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <Checkbox
                        id={`routine-dep-${other.id}`}
                        checked={dependsOn.includes(other.id)}
                        onCheckedChange={(checked) =>
                          setDependsOn(
                            checked
                              ? [...dependsOn, other.id]
                              : dependsOn.filter((id) => id !== other.id),
                          )
                        }
                      />
                      <Label
                        htmlFor={`routine-dep-${other.id}`}
                        className="flex flex-1 cursor-pointer items-center gap-2 font-normal"
                      >
                        <Pill
                          aria-hidden
                          className="size-3.5 text-muted-foreground"
                        />
                        {other.name} ({other.time_of_day})
                      </Label>
                    </div>
                  ))}
              </fieldset>
            )}
          </div>
        )}
      </div>

      {stepError && (
        <p className="text-sm text-destructive" role="alert">
          {stepError}
        </p>
      )}

      <DialogFooter className="mt-2 flex items-center justify-between sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => goTo(step - 1)}
          disabled={step === 0 || submitting}
        >
          <ChevronLeft aria-hidden />
          {t("routineDialog.back")}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => goTo(step + 1)}>
            {t("routineDialog.next")}
            <ChevronRight aria-hidden />
          </Button>
        ) : (
          <LoadingButton
            type="button"
            loading={submitting}
            onClick={handleSubmit}
          >
            {routine
              ? t("routineDialog.saveChanges")
              : t("routineDialog.addSubmit")}
          </LoadingButton>
        )}
      </DialogFooter>
    </>
  )
}
