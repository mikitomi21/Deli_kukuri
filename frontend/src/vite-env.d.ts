/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /**
   * Optional data-source tag (see src/hooks/useWards.ts):
   *   unset / "0" / "false" → real API (default)
   *   "mocks" / "1" / "true" → in-memory mock store (demo data)
   *   "empty"                → mocks with an empty list (empty-state preview)
   */
  readonly VITE_USE_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
