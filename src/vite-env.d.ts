/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `landing` | `marketing` = solo landing pública; vacío = app completa. */
  readonly VITE_PUBLIC_SITE_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
