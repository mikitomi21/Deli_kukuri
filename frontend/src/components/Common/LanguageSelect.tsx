import { Globe } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { SUPPORTED_LANGUAGES, setLanguage } from "@/i18n"

const LANGUAGE_LABELS: Record<(typeof SUPPORTED_LANGUAGES)[number], string> = {
  pl: "Polski",
  en: "English",
}

export function LanguageSelect() {
  const { t, i18n } = useTranslation()
  const current = i18n.language.startsWith("en") ? "en" : "pl"

  return (
    <Select
      value={current}
      onValueChange={(value) => setLanguage(value as "pl" | "en")}
    >
      <SelectTrigger
        aria-label={t("language.label")}
        className="h-8 w-[110px] text-sm"
      >
        <span className="flex items-center gap-1.5">
          <Globe aria-hidden="true" className="size-3.5" />
          {LANGUAGE_LABELS[current]}
        </span>
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <SelectItem key={lang} value={lang}>
            {LANGUAGE_LABELS[lang]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
