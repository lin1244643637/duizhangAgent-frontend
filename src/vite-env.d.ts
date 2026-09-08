/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANALYTICS_DAILY_FACT_V2?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
