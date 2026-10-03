import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { addWard } from "@/hooks/useWards"
import { isValidE164, normalizePhoneToE164 } from "@/lib/phone"
import { handleError } from "@/utils"

const DEFAULT_TZ = "Europe/Warsaw"

type FormData = {
  full_name: string
  phone: string
}

interface AddWardDialogProps {
  children: React.ReactNode
}

/** Add-ward form — payload matches POST /wards (docs/05). */
export function AddWardDialog({ children }: AddWardDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { t } = useTranslation("wards")
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Validation messages come from the wards namespace, so the schema is
  // built per language inside the component.
  const formSchema = useMemo(
    () =>
      z.object({
        full_name: z
          .string()
          .min(1, { message: t("addWard.validation.fullNameRequired") })
          .max(100, { message: t("addWard.validation.fullNameMaxLength") })
          .refine((value) => value.trim().length > 0, {
            message: t("addWard.validation.fullNameRequired"),
          }),
        phone: z
          .string()
          .min(1, { message: t("addWard.validation.phoneRequired") })
          .refine((value) => isValidE164(normalizePhoneToE164(value)), {
            message: t("addWard.validation.phoneInvalid"),
          }),
      }),
    [t],
  )

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      full_name: "",
      phone: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      addWard({
        full_name: data.full_name,
        phone_e164: normalizePhoneToE164(data.phone),
        tz: DEFAULT_TZ,
      }),
    onSuccess: () => {
      showSuccessToast(t("addWard.successToast"))
      form.reset()
      setIsOpen(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["wards"] })
    },
  })

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addWard.title")}</DialogTitle>
          <DialogDescription>{t("addWard.description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))}>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("addWard.fullNameLabel")}{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("addWard.fullNamePlaceholder")}
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
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("addWard.phoneLabel")}{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("addWard.phonePlaceholder")}
                        type="tel"
                        autoComplete="tel"
                        {...field}
                        required
                      />
                    </FormControl>
                    <FormDescription>{t("addWard.phoneHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={mutation.isPending}>
                  {t("wardEdit.cancel")}
                </Button>
              </DialogClose>
              <LoadingButton type="submit" loading={mutation.isPending}>
                {t("addWard.submit")}
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
