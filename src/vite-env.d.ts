/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional Cloudflare Worker base URL. When unset the site calls OverFast API directly. */
  readonly VITE_CAREER_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
