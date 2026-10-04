import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import adminEn from "./locales/en/admin.json"
import authEn from "./locales/en/auth.json"
import commonEn from "./locales/en/common.json"
import landingEn from "./locales/en/landing.json"
import routesEn from "./locales/en/routes.json"
import settingsEn from "./locales/en/settings.json"
import wardsEn from "./locales/en/wards.json"
import adminPl from "./locales/pl/admin.json"
import authPl from "./locales/pl/auth.json"
import commonPl from "./locales/pl/common.json"
import landingPl from "./locales/pl/landing.json"
import routesPl from "./locales/pl/routes.json"
import settingsPl from "./locales/pl/settings.json"
import wardsPl from "./locales/pl/wards.json"

export const SUPPORTED_LANGUAGES = ["pl", "en"] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

const LANG_STORAGE_KEY = "vite-ui-language"

// Guard browser APIs so the module can be imported in non-DOM test
// environments (vitest node) without crashing.
export function getInitialLanguage(): Language {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(LANG_STORAGE_KEY)
    if (stored === "pl" || stored === "en") return stored
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language.toLowerCase().startsWith("pl") ? "pl" : "en"
  }
  return "pl"
}

export function setLanguage(lang: Language) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LANG_STORAGE_KEY, lang)
  }
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
      landing: landingPl,
    },
    en: {
      common: commonEn,
      auth: authEn,
      admin: adminEn,
      wards: wardsEn,
      settings: settingsEn,
      routes: routesEn,
      landing: landingEn,
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
