/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional Cloudflare Worker base URL. When unset the site calls OverFast API directly. */
  readonly VITE_CAREER_API_URL?: string;
  /** Optional override for where the cosmetics files live. When unset they ship with the site. */
  readonly VITE_COSMETICS_DATA_URL?: string;
  /** Optional accounts Worker base URL. When unset the site has no sign-in and tracking stays in the browser. */
  readonly VITE_ACCOUNT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
