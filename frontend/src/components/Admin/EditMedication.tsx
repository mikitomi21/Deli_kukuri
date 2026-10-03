import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import {
  type MedicationPublic,
  MedicationsService,
  type MedicationUpdate,
} from "@/client"
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

export const createMedicationSchema = (t: (key: string) => string) =>
  z.object({
    name: z
      .string()
      .min(1, { message: t("medicationActions.validation.nameRequired") })
      .max(255, { message: t("medicationActions.validation.nameTooLong") }),
    dosage: z
      .string()
      .min(1, { message: t("medicationActions.validation.dosageRequired") })
      .max(100, { message: t("medicationActions.validation.dosageTooLong") }),
    form: z
      .string()
      .max(100, { message: t("medicationActions.validation.formTooLong") })
      .optional(),
    instructions: z
      .string()
      .max(255, {
        message: t("medicationActions.validation.instructionsTooLong"),
      })
      .optional(),
  })

type FormData = z.infer<ReturnType<typeof createMedicationSchema>>

interface EditMedicationProps {
  medication: MedicationPublic
  onSuccess: () => void
}

const EditMedication = ({ medication, onSuccess }: EditMedicationProps) => {
  const { t } = useTranslation("admin")
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(createMedicationSchema(t)),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      name: medication.name,
      dosage: medication.dosage,
      form: medication.form ?? "",
      instructions: medication.instructions ?? "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: MedicationUpdate) =>
      MedicationsService.updateMedication({
        path: { id: medication.id },
        body: data,
      }),
    onSuccess: () => {
      showSuccessToast(t("medicationActions.updated"))
      form.reset()
      setIsOpen(false)
      onSuccess()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["medications"] })
    },
  })

  const onSubmit = (data: FormData) => {
    mutation.mutate({
      ...data,
      form: data.form || undefined,
      instructions: data.instructions || undefined,
    })
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (open) {
          form.reset({
            name: medication.name,
            dosage: medication.dosage,
            form: medication.form ?? "",
            instructions: medication.instructions ?? "",
          })
        }
      }}
    >
      <DropdownMenuItem
        onSelect={(e) => e.preventDefault()}
        onClick={() => setIsOpen(true)}
      >
        <Pencil aria-hidden />
        {t("medicationActions.edit")}
      </DropdownMenuItem>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("medicationActions.editTitle")}</DialogTitle>
          <DialogDescription>
            {t("medicationActions.editDescription")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("medicationActions.name")}{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("medicationActions.namePlaceholder")}
                        type="text"
                        {...field}
                        required
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dosage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("medicationActions.dosage")}{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("medicationActions.dosagePlaceholder")}
                        type="text"
                        {...field}
                        required
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="form"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("medicationActions.form")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("medicationActions.formPlaceholder")}
                        type="text"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("medicationActions.instructions")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t(
                          "medicationActions.instructionsPlaceholder",
                        )}
                        type="text"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={mutation.isPending}>
                  {t("medicationActions.cancel")}
                </Button>
              </DialogClose>
              <LoadingButton type="submit" loading={mutation.isPending}>
                {t("medicationActions.save")}
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default EditMedication
