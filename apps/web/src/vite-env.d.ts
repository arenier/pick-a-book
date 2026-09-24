/// <reference types="vite/client" />

/** Variables Vite inlines at build time — typed here, rather than read as `any`. */
interface ImportMetaEnv {
  /** Origin of the API (ADR 0004: the frontend and the API live on two origins). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
