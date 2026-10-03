import { useTranslation } from "react-i18next"
import { toast } from "sonner"

const useCustomToast = () => {
  const { t } = useTranslation("auth")

  const showSuccessToast = (description: string) => {
    toast.success(t("toasts.successTitle"), {
      description,
    })
  }

  const showErrorToast = (description: string) => {
    toast.error(t("toasts.errorTitle"), {
      description,
    })
  }

  return { showSuccessToast, showErrorToast }
}

export default useCustomToast
