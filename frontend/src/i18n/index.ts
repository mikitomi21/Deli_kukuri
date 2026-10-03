import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import adminEn from "./locales/en/admin.json"
import authEn from "./locales/en/auth.json"
import commonEn from "./locales/en/common.json"
import routesEn from "./locales/en/routes.json"
import settingsEn from "./locales/en/settings.json"
import wardsEn from "./locales/en/wards.json"
import adminPl from "./locales/pl/admin.json"
import authPl from "./locales/pl/auth.json"
import commonPl from "./locales/pl/common.json"
import routesPl from "./locales/pl/routes.json"
import settingsPl from "./locales/pl/settings.json"
import wardsPl from "./locales/pl/wards.json"

export const SUPPORTED_LANGUAGES = ["pl", "en"] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

const LANG_STORAGE_KEY = "vite-ui-language"

export function getInitialLanguage(): Language {
  const stored = localStorage.getItem(LANG_STORAGE_KEY)
  if (stored === "pl" || stored === "en") return stored
  return navigator.language.toLowerCase().startsWith("pl") ? "pl" : "en"
}

export function setLanguage(lang: Language) {
  localStorage.setItem(LANG_STORAGE_KEY, lang)
  return i18n.changeLanguage(lang)
}

i18n.use(initReactI18next).init({
  resources: {
    pl: {
      common: commonPl,
      auth: authPl,
      admin: adminPl,
      wards: wardsPl,
      settings: settingsPl,
      routes: routesPl,
    },
    en: {
      common: commonEn,
      auth: authEn,
      admin: adminEn,
      wards: wardsEn,
      settings: settingsEn,
      routes: routesEn,
    },
  },
  lng: getInitialLanguage(),
  fallbackLng: "pl",
  interpolation: { escapeValue: false },
})

// Keep <html lang> in sync so screen readers and spellcheck follow the UI language.
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng
})

export default i18n
