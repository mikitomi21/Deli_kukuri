import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useCustomToast from "@/hooks/useCustomToast"
import { editWard } from "@/hooks/useWards"
import { isValidE164, normalizePhoneToE164 } from "@/lib/phone"
import type { WardUpdate } from "@/client"
import type { WardWithToday } from "@/types/dashboard"
import { handleError } from "@/utils"

interface WardEditDialogProps {
  ward: WardWithToday
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SmsPreference = NonNullable<WardUpdate["sms_notification_preference"]>

/** PATCH /wards/{id} per docs/05: profile details and SMS preference. */
export function WardEditDialog({
  ward,
  open,
  onOpenChange,
}: WardEditDialogProps) {
  const [fullName, setFullName] = useState(ward.full_name)
  const [phone, setPhone] = useState(ward.phone_e164)
  const [smsPreference, setSmsPreference] = useState<SmsPreference>(
    ward.sms_notification_preference ?? "issues_only",
  )
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { t } = useTranslation("wards")
  const { showSuccessToast, showErrorToast } = useCustomToast()

  useEffect(() => {
    if (open) {
      setFullName(ward.full_name)
      setPhone(ward.phone_e164)
      setSmsPreference(ward.sms_notification_preference ?? "issues_only")
      setError(null)
    }
  }, [open, ward])

  const mutation = useMutation({
    mutationFn: () =>
      editWard(ward.id, {
        full_name: fullName.trim(),
        phone_e164: normalizePhoneToE164(phone),
        sms_notification_preference: smsPreference,
      }),
    onSuccess: () => {
      showSuccessToast(t("wardEdit.successToast"))
      onOpenChange(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["wards"] })
      queryClient.invalidateQueries({ queryKey: ["ward", ward.id] })
    },
  })

  const submit = () => {
    if (!fullName.trim()) {
      setError(t("addWard.validation.fullNameRequired"))
      return
    }
    const normalized = normalizePhoneToE164(phone)
    if (!isValidE164(normalized)) {
      setError(t("addWard.validation.phoneInvalid"))
      return
    }
    setError(null)
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("wardEdit.title")}</DialogTitle>
          <DialogDescription>{t("wardEdit.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="ward-name">
              {t("wardEdit.fullNameLabel")}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ward-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              maxLength={100}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ward-phone">
              {t("wardEdit.phoneLabel")}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ward-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              aria-describedby="ward-phone-hint"
            />
            <p id="ward-phone-hint" className="text-xs text-muted-foreground">
              {t("wardEdit.phoneHint")}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ward-tz">{t("wardEdit.tzLabel")}</Label>
            <Input id="ward-tz" value={ward.tz} readOnly aria-readonly />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ward-sms-preference">
              {t("smsNotifications.label")}
            </Label>
            <Select
              value={smsPreference}
              onValueChange={(value) =>
                setSmsPreference(value as SmsPreference)
              }
            >
              <SelectTrigger id="ward-sms-preference">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="always">
                  {t("smsNotifications.always")}
                </SelectItem>
                <SelectItem value="issues_only">
                  {t("smsNotifications.issuesOnly")}
                </SelectItem>
                <SelectItem value="never">
                  {t("smsNotifications.never")}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("smsNotifications.description")}
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={mutation.isPending}>
              {t("wardEdit.cancel")}
            </Button>
          </DialogClose>
          <LoadingButton onClick={submit} loading={mutation.isPending}>
            {t("wardEdit.save")}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
